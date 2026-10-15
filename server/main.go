package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type App struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	ArtifactType string `json:"artifact_type"`
	BuildCommand string `json:"build_command"`
	ArtifactPath string `json:"artifact_path"`
	RunCommand   string `json:"run_command"`
}

const (
	serverFilesDir = "./server-files"
	manifestPath   = serverFilesDir + "/manifest.json"
	configPath     = serverFilesDir + "/server.config.json"
)

var (
	appList []App
	config  ServerConfig
)

type ServerConfig struct {
	Port string `json:"port"`
}

// --- Config Management ---

func loadConfig() (ServerConfig, error) {
	var cfg ServerConfig
	content, err := os.ReadFile(configPath)
	if err != nil {
		// If file doesn't exist, create it with default values
		if os.IsNotExist(err) {
			log.Println("Config file not found. Creating with default port 8080.")
			cfg.Port = "8080"
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
	return cfg, nil
}

func saveConfig(cfg ServerConfig) error {
	content, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to serialize config data: %w", err)
	}
	return os.WriteFile(configPath, content, 0644)
}

// --- Handlers ---

func listApplications(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(appList)
}

func getManifest(w http.ResponseWriter, r *http.Request) {
	content, err := os.ReadFile(manifestPath)
	if err != nil {
		http.Error(w, "Failed to read manifest file", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(content)
}

func updateManifest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Only PUT method is allowed", http.StatusMethodNotAllowed)
		return
	}

	var updatedAppList []App
	if err := json.NewDecoder(r.Body).Decode(&updatedAppList); err != nil {
		http.Error(w, "Invalid JSON format", http.StatusBadRequest)
		return
	}

	// Write updated content to manifest.json
	updatedContent, err := json.MarshalIndent(updatedAppList, "", "  ")
	if err != nil {
		http.Error(w, "Failed to serialize manifest data", http.StatusInternalServerError)
		return
	}
	if err := os.WriteFile(manifestPath, updatedContent, 0644); err != nil {
		http.Error(w, "Failed to write manifest file", http.StatusInternalServerError)
		return
	}

	// Update in-memory appList
	appList = updatedAppList
	log.Println("Manifest file updated successfully.")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintln(w, "Manifest updated successfully")
}

func getArtifact(w http.ResponseWriter, r *http.Request) {
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

	var targetApp *App
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

	log.Printf("Building '%s' with: %s", targetApp.Name, targetApp.BuildCommand)
	cmd := exec.Command("bash", "-c", targetApp.BuildCommand)
	cmd.Dir = serverFilesDir // Set working directory for the build command
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("Build failed for '%s': %s\n%s", targetApp.Name, err, string(output))
		http.Error(w, fmt.Sprintf("Build failed: %s", string(output)), http.StatusInternalServerError)
		return
	}
	log.Printf("Build successful for '%s'", targetApp.Name)

	artifactAbsPath := filepath.Join(serverFilesDir, targetApp.ArtifactPath)
	fileName := filepath.Base(artifactAbsPath)
	w.Header().Set("Content-Disposition", "attachment; filename=\""+fileName+"\"")
	http.ServeFile(w, r, artifactAbsPath)
}

func getConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(config); err != nil {
		http.Error(w, "Failed to encode config", http.StatusInternalServerError)
	}
}

func updateConfig(w http.ResponseWriter, r *http.Request) {
	var newConfig ServerConfig
	if err := json.NewDecoder(r.Body).Decode(&newConfig); err != nil {
		http.Error(w, "Invalid JSON format", http.StatusBadRequest)
		return
	}

	if err := saveConfig(newConfig); err != nil {
		http.Error(w, "Failed to save config file", http.StatusInternalServerError)
		return
	}

	config = newConfig
	log.Println("Server config file updated successfully.")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintln(w, "Config updated successfully. Please restart the server to apply changes.")
}

func restartServer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	w.WriteHeader(http.StatusOK)
	fmt.Fprintln(w, "Server is restarting...")

	// Restart logic in a new goroutine to allow the response to be sent
	go func() {
		time.Sleep(1 * time.Second) // Give client time to receive response

		// This restart logic is simplified for development with `go run`.
		// For a production build, you would execute the compiled binary.
		cmd := exec.Command("go", "run", "main.go")
		cmd.Dir = "./" // Assuming we run from the server directory
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr

		log.Println("Starting new server process...")
		err := cmd.Start()
		if err != nil {
			log.Printf("Failed to restart server: %s", err)
			return
		}

		log.Println("Exiting old server process.")
		os.Exit(0)
	}()
}

// --- CORS Middleware ---

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

// --- Main ---

func main() {
	// Load config at startup
	var err error
	config, err = loadConfig()
	if err != nil {
		log.Fatalf("Failed to load configuration: %s", err)
	}

	// Load manifest at startup
	content, err := os.ReadFile(manifestPath)
	if err != nil {
		log.Fatalf("Failed to read manifest file at %s: %s", manifestPath, err)
	}
	if err := json.Unmarshal(content, &appList); err != nil {
		log.Fatalf("Failed to parse manifest file: %s", err)
	}
	log.Printf("Loaded %d applications from manifest.", len(appList))

	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/status", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `Server is running`)
	})
	mux.HandleFunc("/api/v1/applications", listApplications)
	mux.HandleFunc("/api/v1/applications/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/artifact") {
			getArtifact(w, r)
		} else {
			http.NotFound(w, r)
		}
	})

	// --- Admin APIs ---
	mux.HandleFunc("/api/admin/manifest", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			getManifest(w, r)
		case http.MethodPut:
			updateManifest(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/admin/server/config", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			getConfig(w, r)
		case http.MethodPut:
			updateConfig(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/admin/server/restart", restartServer)

	// Serve Admin Frontend
	adminFS := http.FileServer(http.Dir("admin-frontend/dist"))
	mux.Handle("/admin/", http.StripPrefix("/admin/", adminFS))

	httpHandler := corsMiddleware(mux)

	log.Printf("Starting server on http://localhost:%s\n", config.Port)
	if err := http.ListenAndServe(":"+config.Port, httpHandler); err != nil {
		log.Fatalf("Failed to start server: %s\n", err)
	}
}
