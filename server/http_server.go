package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type AppItem struct {
	Name           string `json:"name"`
	Description    string `json:"description"`
	SourcePath     string `json:"source_path,omitempty"`
	ArtifactType   string `json:"artifact_type"`
	BuildCommand   string `json:"build_command,omitempty"`
	ArtifactPath   string `json:"artifact_path"`
	RunCommand     string `json:"run_command"`
	LaunchType     string `json:"launch_type,omitempty"` // "gui" or "terminal"
	ArtifactExists bool   `json:"artifact_exists,omitempty"`
}

type ServerConfig struct {
	Port    string `json:"port"`
	AppsDir string `json:"apps_dir"`
}

const (
	defaultPort = "8080"
)

func getConfigPath() string {
	// Look for server.config.json in current directory or legacy server-files
	if _, err := os.Stat("server.config.json"); err == nil {
		return "server.config.json"
	}
	if _, err := os.Stat("server-files/server.config.json"); err == nil {
		return "server-files/server.config.json"
	}
	return "server.config.json"
}

func getDefaultAppsDir() string {
	// Prefer ./server-files if exists, otherwise default to ./server-files
	abs, err := filepath.Abs("./server-files")
	if err == nil {
		return abs
	}
	return "./server-files"
}

func loadConfig() (ServerConfig, error) {
	var cfg ServerConfig
	path := getConfigPath()
	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			cfg.Port = defaultPort
			cfg.AppsDir = getDefaultAppsDir()
			if err := saveConfig(cfg); err != nil {
				return cfg, fmt.Errorf("failed to create default config file: %w", err)
			}
			return cfg, nil
		}
		return cfg, fmt.Errorf("failed to read config file: %w", err)
	}

	if err := json.Unmarshal(content, &cfg); err != nil {
		return cfg, fmt.Errorf("failed to parse config file: %w", err)
	}

	if cfg.Port == "" {
		cfg.Port = defaultPort
	}
	if cfg.AppsDir == "" {
		cfg.AppsDir = getDefaultAppsDir()
	}

	// Ensure absolute path
	if abs, err := filepath.Abs(cfg.AppsDir); err == nil {
		cfg.AppsDir = abs
	}

	return cfg, nil
}

func saveConfig(cfg ServerConfig) error {
	path := getConfigPath()
	content, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to serialize config data: %w", err)
	}
	return os.WriteFile(path, content, 0644)
}

type HTTPServer struct {
	server  *http.Server
	port    string
	appsDir string
	mu      sync.RWMutex
	onLog   func(level string, message string)
}

func NewHTTPServer(onLog func(level string, message string)) *HTTPServer {
	return &HTTPServer{
		onLog:   onLog,
		appsDir: getDefaultAppsDir(),
	}
}

func (s *HTTPServer) log(level, format string, v ...interface{}) {
	msg := fmt.Sprintf(format, v...)
	log.Printf("[%s] %s", level, msg)
	if s.onLog != nil {
		s.onLog(level, msg)
	}
}

func (s *HTTPServer) GetAppsDir() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.appsDir
}

func (s *HTTPServer) SetAppsDir(dir string) error {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return fmt.Errorf("invalid path: %w", err)
	}

	if err := os.MkdirAll(abs, 0755); err != nil {
		return fmt.Errorf("failed to create directory %s: %w", abs, err)
	}

	s.mu.Lock()
	s.appsDir = abs
	s.mu.Unlock()

	// Ensure manifest.json exists in the new apps directory
	manifestPath := filepath.Join(abs, "manifest.json")
	if _, err := os.Stat(manifestPath); os.IsNotExist(err) {
		emptyList := []AppItem{}
		bytes, _ := json.MarshalIndent(emptyList, "", "  ")
		_ = os.WriteFile(manifestPath, bytes, 0644)
		s.log("INFO", "Initialized new manifest.json at %s", manifestPath)
	}

	s.log("INFO", "Apps directory set to: %s", abs)
	return nil
}

func (s *HTTPServer) LoadManifest() ([]AppItem, error) {
	manifestPath := filepath.Join(s.GetAppsDir(), "manifest.json")
	var appList []AppItem
	content, err := os.ReadFile(manifestPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []AppItem{}, nil
		}
		return nil, fmt.Errorf("failed to read manifest at %s: %w", manifestPath, err)
	}
	if err := json.Unmarshal(content, &appList); err != nil {
		return nil, fmt.Errorf("failed to parse manifest: %w", err)
	}

	appsDir := s.GetAppsDir()
	for i := range appList {
		artifactPath := filepath.Join(appsDir, appList[i].ArtifactPath)
		if _, err := os.Stat(artifactPath); err == nil {
			appList[i].ArtifactExists = true
		} else {
			appList[i].ArtifactExists = false
		}
	}

	return appList, nil
}

func (s *HTTPServer) SaveManifest(apps []AppItem) error {
	manifestPath := filepath.Join(s.GetAppsDir(), "manifest.json")
	content, err := json.MarshalIndent(apps, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to serialize manifest data: %w", err)
	}
	return os.WriteFile(manifestPath, content, 0644)
}

// Start launches the HTTP server in a background goroutine.
func (s *HTTPServer) Start(port string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.server != nil {
		return fmt.Errorf("server is already running")
	}

	s.port = port
	mux := http.NewServeMux()

	// API Endpoints
	mux.HandleFunc("/api/v1/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprintf(w, "Server is running")
	})

	mux.HandleFunc("/api/v1/applications", func(w http.ResponseWriter, r *http.Request) {
		appList, err := s.LoadManifest()
		if err != nil {
			s.log("ERROR", "Failed to load manifest: %v", err)
			http.Error(w, "Failed to load applications", http.StatusInternalServerError)
			return
		}
		s.log("INFO", "%s requested applications list (%d apps)", r.RemoteAddr, len(appList))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(appList)
	})

	mux.HandleFunc("/api/v1/applications/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/artifact") {
			s.handleGetArtifact(w, r)
		} else {
			http.NotFound(w, r)
		}
	})

	// Admin APIs for web compatibility
	mux.HandleFunc("/api/admin/manifest", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			manifestPath := filepath.Join(s.GetAppsDir(), "manifest.json")
			content, err := os.ReadFile(manifestPath)
			if err != nil {
				http.Error(w, "Failed to read manifest file", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write(content)
		case http.MethodPut:
			var updatedAppList []AppItem
			if err := json.NewDecoder(r.Body).Decode(&updatedAppList); err != nil {
				http.Error(w, "Invalid JSON format", http.StatusBadRequest)
				return
			}
			if err := s.SaveManifest(updatedAppList); err != nil {
				http.Error(w, "Failed to write manifest file", http.StatusInternalServerError)
				return
			}
			s.log("INFO", "Manifest updated via admin API")
			w.WriteHeader(http.StatusOK)
			fmt.Fprintln(w, "Manifest updated successfully")
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/api/admin/server/config", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			cfg, err := loadConfig()
			if err != nil {
				http.Error(w, "Failed to load config", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(cfg)
		case http.MethodPut:
			var newConfig ServerConfig
			if err := json.NewDecoder(r.Body).Decode(&newConfig); err != nil {
				http.Error(w, "Invalid JSON format", http.StatusBadRequest)
				return
			}
			if err := saveConfig(newConfig); err != nil {
				http.Error(w, "Failed to save config", http.StatusInternalServerError)
				return
			}
			s.log("INFO", "Server config updated: Port=%s, AppsDir=%s", newConfig.Port, newConfig.AppsDir)
			w.WriteHeader(http.StatusOK)
			fmt.Fprintln(w, "Config updated successfully")
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Static web admin fallback
	adminFS := http.FileServer(http.Dir("frontend/dist"))
	mux.Handle("/admin/", http.StripPrefix("/admin/", adminFS))

	handler := corsMiddleware(mux)

	s.server = &http.Server{
		Addr:    ":" + port,
		Handler: handler,
	}

	go func() {
		s.log("INFO", "Distribution HTTP server started on :%s (Apps Dir: %s)", port, s.GetAppsDir())
		if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			s.log("ERROR", "HTTP server error: %v", err)
		}
	}()

	return nil
}

func (s *HTTPServer) Stop(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.server == nil {
		return nil
	}

	s.log("INFO", "Stopping HTTP server on :%s...", s.port)
	err := s.server.Shutdown(ctx)
	s.server = nil
	return err
}

func (s *HTTPServer) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.server != nil
}

func (s *HTTPServer) handleGetArtifact(w http.ResponseWriter, r *http.Request) {
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) != 6 {
		http.NotFound(w, r)
		return
	}
	encodedAppName := pathParts[4]
	appName, err := url.PathUnescape(encodedAppName)
	if err != nil {
		http.Error(w, "Invalid app name", http.StatusBadRequest)
		return
	}

	appList, err := s.LoadManifest()
	if err != nil {
		http.Error(w, "Failed to load manifest", http.StatusInternalServerError)
		return
	}

	var targetApp *AppItem
	for i := range appList {
		if appList[i].Name == appName {
			targetApp = &appList[i]
			break
		}
	}
	if targetApp == nil {
		http.Error(w, "Application not found", http.StatusNotFound)
		return
	}

	appsDir := s.GetAppsDir()
	artifactAbsPath := filepath.Join(appsDir, targetApp.ArtifactPath)

	// If artifact doesn't exist yet, try to build it
	if _, err := os.Stat(artifactAbsPath); os.IsNotExist(err) {
		s.log("INFO", "Building '%s' on-demand...", targetApp.Name)
		output, err := ExecuteBuild(appsDir, *targetApp)
		if err != nil {
			s.log("ERROR", "Build failed for '%s': %v\n%s", targetApp.Name, err, output)
			http.Error(w, fmt.Sprintf("Build failed: %s", output), http.StatusInternalServerError)
			return
		}
		s.log("INFO", "Build successful for '%s'", targetApp.Name)
	}

	if _, err := os.Stat(artifactAbsPath); os.IsNotExist(err) {
		s.log("ERROR", "Artifact file not found: %s", artifactAbsPath)
		http.Error(w, "Artifact file not found", http.StatusNotFound)
		return
	}

	fileName := filepath.Base(artifactAbsPath)
	s.log("INFO", "Delivering artifact '%s' to %s", fileName, r.RemoteAddr)
	w.Header().Set("Content-Disposition", "attachment; filename=\""+fileName+"\"")
	http.ServeFile(w, r, artifactAbsPath)
}

func corsMiddleware(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		handler.ServeHTTP(w, r)
	})
}

// GetLocalIPs returns non-loopback IPv4 addresses of this machine.
func GetLocalIPs() []string {
	var ips []string
	interfaces, err := net.Interfaces()
	if err != nil {
		return ips
	}
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() {
				continue
			}
			if ip.To4() != nil {
				ips = append(ips, ip.String())
			}
		}
	}
	return ips
}
