package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx        context.Context
	httpServer *HTTPServer
	config     ServerConfig
}

type ServerStatus struct {
	Running bool     `json:"running"`
	Port    string   `json:"port"`
	IPs     []string `json:"ips"`
	URLs    []string `json:"urls"`
	AppsDir string   `json:"apps_dir"`
}

type LogMessage struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Message   string `json:"message"`
}

func NewApp() *App {
	a := &App{}
	a.httpServer = NewHTTPServer(func(level string, message string) {
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "server-log", LogMessage{
				Timestamp: time.Now().Format("15:04:05"),
				Level:     level,
				Message:   message,
			})
		}
	})
	return a
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	cfg, err := loadConfig()
	if err != nil {
		runtime.LogErrorf(ctx, "Failed to load config: %v", err)
		cfg = ServerConfig{Port: "8080", AppsDir: getDefaultAppsDir()}
	}
	a.config = cfg

	// Set initial apps directory
	if err := a.httpServer.SetAppsDir(cfg.AppsDir); err != nil {
		runtime.LogErrorf(ctx, "Failed to set apps directory: %v", err)
	}

	// Automatically start HTTP server in background
	if err := a.httpServer.Start(cfg.Port); err != nil {
		runtime.LogErrorf(ctx, "Failed to start HTTP server: %v", err)
	}
}

func (a *App) shutdown(ctx context.Context) {
	if a.httpServer != nil {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		a.httpServer.Stop(shutdownCtx)
	}
}

// GetServerStatus returns network, apps dir and server state for GUI
func (a *App) GetServerStatus() ServerStatus {
	ips := GetLocalIPs()
	var urls []string
	port := a.config.Port

	for _, ip := range ips {
		urls = append(urls, fmt.Sprintf("http://%s:%s", ip, port))
	}
	if len(urls) == 0 {
		urls = append(urls, fmt.Sprintf("http://localhost:%s", port))
	}

	return ServerStatus{
		Running: a.httpServer.IsRunning(),
		Port:    port,
		IPs:     ips,
		URLs:    urls,
		AppsDir: a.httpServer.GetAppsDir(),
	}
}

// SelectAppsDirectory opens native directory picker and updates the apps directory
func (a *App) SelectAppsDirectory() (string, error) {
	selectedDir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		DefaultDirectory: a.httpServer.GetAppsDir(),
		Title:            "配信する作品ディレクトリを選択",
	})
	if err != nil {
		return "", err
	}
	if selectedDir == "" {
		return a.httpServer.GetAppsDir(), nil // user cancelled
	}

	if err := a.SetAppsDirectory(selectedDir); err != nil {
		return "", err
	}
	return selectedDir, nil
}

// SetAppsDirectory sets the apps directory and saves config
func (a *App) SetAppsDirectory(dir string) error {
	if err := a.httpServer.SetAppsDir(dir); err != nil {
		return err
	}
	a.config.AppsDir = a.httpServer.GetAppsDir()
	if err := saveConfig(a.config); err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}
	return nil
}

// OpenAppsDirectory opens the folder in OS file manager
func (a *App) OpenAppsDirectory() error {
	dir := a.httpServer.GetAppsDir()
	var cmd *exec.Cmd

	switch goruntime.GOOS {
	case "darwin":
		cmd = exec.Command("open", dir)
	case "windows":
		cmd = exec.Command("explorer", dir)
	case "linux":
		cmd = exec.Command("xdg-open", dir)
	default:
		return fmt.Errorf("unsupported OS: %s", goruntime.GOOS)
	}

	return cmd.Start()
}

// GetManifest returns parsed applications from the current apps directory
func (a *App) GetManifest() ([]AppItem, error) {
	return a.httpServer.LoadManifest()
}

// SaveManifest saves applications list into the current apps directory
func (a *App) SaveManifest(apps []AppItem) error {
	return a.httpServer.SaveManifest(apps)
}

// GetRawManifestJSON returns manifest as formatted JSON string
func (a *App) GetRawManifestJSON() (string, error) {
	content, err := a.httpServer.LoadManifest()
	if err != nil {
		return "", err
	}
	bytes, err := json.MarshalIndent(content, "", "  ")
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// SaveRawManifestJSON parses and saves JSON string into current apps directory
func (a *App) SaveRawManifestJSON(jsonStr string) error {
	var apps []AppItem
	if err := json.Unmarshal([]byte(jsonStr), &apps); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}
	return a.httpServer.SaveManifest(apps)
}

// UpdatePort changes port and restarts HTTP server
func (a *App) UpdatePort(newPort string) error {
	if newPort == "" {
		return fmt.Errorf("port cannot be empty")
	}

	a.config.Port = newPort
	if err := saveConfig(a.config); err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}

	// Restart server with new port
	if a.httpServer.IsRunning() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		a.httpServer.Stop(ctx)
		return a.httpServer.Start(newPort)
	}
	return nil
}

// ToggleServer starts or stops the HTTP distribution server
func (a *App) ToggleServer(enable bool) error {
	if enable {
		if a.httpServer.IsRunning() {
			return nil
		}
		return a.httpServer.Start(a.config.Port)
	} else {
		if !a.httpServer.IsRunning() {
			return nil
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		return a.httpServer.Stop(ctx)
	}
}

// SuggestBuildParameters returns recommended build and run options based on source file
func (a *App) SuggestBuildParameters(sourcePath string, appName string) BuildSuggestion {
	return SuggestBuild(sourcePath, appName)
}

// BuildApplication triggers build for an existing registered application
func (a *App) BuildApplication(name string) (string, error) {
	apps, err := a.httpServer.LoadManifest()
	if err != nil {
		return "", err
	}
	for _, app := range apps {
		if app.Name == name {
			a.httpServer.log("INFO", "Manually building application '%s'...", name)
			output, err := ExecuteBuild(a.httpServer.GetAppsDir(), app)
			if err != nil {
				a.httpServer.log("ERROR", "Build failed for '%s': %v", name, err)
				return output, err
			}
			a.httpServer.log("INFO", "Build succeeded for '%s'", name)
			return output, nil
		}
	}
	return "", fmt.Errorf("application not found: %s", name)
}

// RegisterApplication adds or updates an application, optionally executing build immediately
func (a *App) RegisterApplication(app AppItem, autoBuild bool) (string, error) {
	if app.Name == "" {
		return "", fmt.Errorf("application name is required")
	}

	var buildLog string
	if autoBuild {
		a.httpServer.log("INFO", "Building application '%s' on registration...", app.Name)
		output, err := ExecuteBuild(a.httpServer.GetAppsDir(), app)
		buildLog = output
		if err != nil {
			a.httpServer.log("ERROR", "Registration build failed for '%s': %v", app.Name, err)
			return buildLog, fmt.Errorf("build failed: %w", err)
		}
		a.httpServer.log("INFO", "Registration build succeeded for '%s'", app.Name)
	}

	apps, err := a.httpServer.LoadManifest()
	if err != nil {
		apps = []AppItem{}
	}

	// Update if exists, else append
	updated := false
	for i := range apps {
		if apps[i].Name == app.Name {
			apps[i] = app
			updated = true
			break
		}
	}
	if !updated {
		apps = append(apps, app)
	}

	if err := a.httpServer.SaveManifest(apps); err != nil {
		return buildLog, fmt.Errorf("failed to save manifest: %w", err)
	}

	return buildLog, nil
}

// DeleteApplication removes an application from manifest
func (a *App) DeleteApplication(name string) error {
	apps, err := a.httpServer.LoadManifest()
	if err != nil {
		return err
	}

	var newApps []AppItem
	for _, app := range apps {
		if app.Name != name {
			newApps = append(newApps, app)
		}
	}

	return a.httpServer.SaveManifest(newApps)
}

// ListSourceFiles scans apps directory and returns candidate source files (.py, .c, .cpp, .go, .rb, .zip, etc.)
func (a *App) ListSourceFiles() ([]string, error) {
	appsDir := a.httpServer.GetAppsDir()
	var files []string

	err := filepath.Walk(appsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			if info.Name() == "dist" || strings.HasPrefix(info.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}

		rel, err := filepath.Rel(appsDir, path)
		if err != nil {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(rel))
		switch ext {
		case ".py", ".c", ".cpp", ".cc", ".go", ".rb", ".zip", ".sh":
			files = append(files, rel)
		default:
			if info.Mode()&0111 != 0 {
				files = append(files, rel)
			}
		}
		return nil
	})

	return files, err
}
