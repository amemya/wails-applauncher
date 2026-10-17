package main

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// SaveAndRunArtifact saves the artifact, and then executes it directly (GUI) or in a new terminal window.
func (a *App) SaveAndRunArtifact(isZip bool, fileData []byte, runCommand string, launchType string) (string, error) {
	tempDir, err := os.MkdirTemp("", "wails-app-")
	if err != nil {
		return "", fmt.Errorf("failed to create temp dir: %w", err)
	}
	// Not cleaning up tempDir immediately so application can run.

	var commandToRun string
	var workingDir string

	if isZip {
		workingDir, commandToRun, err = unzipArtifact(fileData, tempDir, runCommand)
	} else {
		workingDir = tempDir
		commandToRun, err = saveRawArtifact(fileData, tempDir, runCommand)
	}
	if err != nil {
		return "", err
	}

	isGUI := strings.ToLower(strings.TrimSpace(launchType)) == "gui"
	if isGUI {
		return a.launchDirectGUI(workingDir, commandToRun, runCommand)
	}
	return a.launchInTerminal(workingDir, commandToRun, runCommand)
}

// launchDirectGUI starts application directly without opening terminal window (ideal for games)
func (a *App) launchDirectGUI(workingDir, commandToRun, runCommand string) (string, error) {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin", "linux":
		cmd = exec.Command("bash", "-c", commandToRun)
		if workingDir != "" {
			cmd.Dir = workingDir
		}
	case "windows":
		cmd = exec.Command("cmd", "/C", "start", "", commandToRun)
		if workingDir != "" {
			cmd.Dir = workingDir
		}
	default:
		return "", fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}

	// Start asynchronously so the launcher does not block
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("failed to launch GUI application: %w", err)
	}

	return fmt.Sprintf("Started '%s' (GUI Mode, PID %d)", runCommand, cmd.Process.Pid), nil
}

// launchInTerminal launches application inside an interactive terminal emulator
func (a *App) launchInTerminal(workingDir, commandToRun, runCommand string) (string, error) {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin":
		var script string
		if workingDir != "" {
			script = fmt.Sprintf("cd '%s' && %s", workingDir, commandToRun)
		} else {
			script = commandToRun
		}
		escapedScript := strings.ReplaceAll(script, `"`, `\\\"`)
		appleScript := `tell application "Terminal" to do script "` + escapedScript + `"`
		cmd = exec.Command("osascript", "-e", appleScript)

	case "windows":
		cmd = exec.Command("cmd", "/C", "start", "cmd.exe", "/K", commandToRun)
		if workingDir != "" {
			cmd.Dir = workingDir
		}

	case "linux":
		var script string
		if workingDir != "" {
			script = fmt.Sprintf("cd '%s' && %s; exec bash", workingDir, commandToRun)
		} else {
			script = fmt.Sprintf("%s; exec bash", commandToRun)
		}
		cmd = exec.Command("x-terminal-emulator", "-e", "bash", "-c", script)
		if workingDir != "" {
			cmd.Dir = workingDir
		}

	default:
		return "", fmt.Errorf("unsupported OS for terminal execution: %s", runtime.GOOS)
	}

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("failed to launch terminal: %w", err)
	}

	return fmt.Sprintf("Launched '%s' in a new terminal.", runCommand), nil
}

// unzipArtifact unpacks a zip archive into a temporary directory.
func unzipArtifact(fileData []byte, tempDir, runCommand string) (string, string, error) {
	zipReader, err := zip.NewReader(bytes.NewReader(fileData), int64(len(fileData)))
	if err != nil {
		return "", "", fmt.Errorf("failed to read zip data: %w", err)
	}
	for _, file := range zipReader.File {
		extractedFilePath := filepath.Join(tempDir, file.Name)
		if file.FileInfo().IsDir() {
			os.MkdirAll(extractedFilePath, file.Mode())
			continue
		}
		fileReader, err := file.Open()
		if err != nil {
			return "", "", err
		}
		defer fileReader.Close()
		targetFile, err := os.OpenFile(extractedFilePath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, file.Mode())
		if err != nil {
			return "", "", err
		}
		defer targetFile.Close()
		if _, err := io.Copy(targetFile, fileReader); err != nil {
			return "", "", err
		}
		// Preserve executable permissions on extracted binaries
		if file.Mode()&0111 != 0 {
			os.Chmod(extractedFilePath, file.Mode())
		}
	}
	return tempDir, runCommand, nil
}

// saveRawArtifact saves a raw binary file to a temporary directory.
func saveRawArtifact(fileData []byte, tempDir, runCommand string) (string, error) {
	parts := strings.Fields(runCommand)
	execName := "app"
	if len(parts) > 0 {
		execName = filepath.Base(parts[0])
	}
	if runtime.GOOS == "windows" && !strings.HasSuffix(execName, ".exe") {
		execName += ".exe"
	}

	executablePath := filepath.Join(tempDir, execName)
	err := os.WriteFile(executablePath, fileData, 0755)
	if err != nil {
		return "", fmt.Errorf("failed to write executable: %w", err)
	}

	if len(parts) > 1 {
		return fmt.Sprintf("./%s %s", execName, strings.Join(parts[1:], " ")), nil
	}
	return fmt.Sprintf("./%s", execName), nil
}
