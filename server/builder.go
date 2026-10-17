package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type BuildSuggestion struct {
	SuggestedCommand string `json:"suggested_command"`
	ArtifactType     string `json:"artifact_type"`
	ArtifactPath     string `json:"artifact_path"`
	RunCommand       string `json:"run_command"`
	LaunchType       string `json:"launch_type"`
	DetectedLanguage string `json:"detected_language"`
}

// SuggestBuild analyzes the source file and returns recommended build and run parameters
func SuggestBuild(sourcePath string, appName string) BuildSuggestion {
	if appName == "" {
		base := filepath.Base(sourcePath)
		ext := filepath.Ext(base)
		appName = strings.TrimSuffix(base, ext)
	}

	cleanName := strings.ToLower(strings.ReplaceAll(appName, " ", "_"))
	ext := strings.ToLower(filepath.Ext(sourcePath))

	switch ext {
	case ".py":
		return BuildSuggestion{
			DetectedLanguage: "Python (Auto-Pack to Standalone Binary)",
			ArtifactType:     "binary",
			ArtifactPath:     fmt.Sprintf("dist/%s", cleanName),
			RunCommand:       cleanName,
			LaunchType:       "gui",
			SuggestedCommand: fmt.Sprintf("mkdir -p ./dist && pyinstaller --onefile --clean -y --distpath ./dist -n %s %s", cleanName, sourcePath),
		}

	case ".c":
		return BuildSuggestion{
			DetectedLanguage: "C Language (GCC Compile)",
			ArtifactType:     "binary",
			ArtifactPath:     fmt.Sprintf("dist/%s", cleanName),
			RunCommand:       cleanName,
			LaunchType:       "terminal",
			SuggestedCommand: fmt.Sprintf("mkdir -p ./dist && gcc -O2 -o ./dist/%s %s", cleanName, sourcePath),
		}

	case ".cpp", ".cc", ".cxx":
		return BuildSuggestion{
			DetectedLanguage: "C++ Language (G++ Compile)",
			ArtifactType:     "binary",
			ArtifactPath:     fmt.Sprintf("dist/%s", cleanName),
			RunCommand:       cleanName,
			LaunchType:       "terminal",
			SuggestedCommand: fmt.Sprintf("mkdir -p ./dist && g++ -O2 -o ./dist/%s %s", cleanName, sourcePath),
		}

	case ".go":
		return BuildSuggestion{
			DetectedLanguage: "Go (Go Build)",
			ArtifactType:     "binary",
			ArtifactPath:     fmt.Sprintf("dist/%s", cleanName),
			RunCommand:       cleanName,
			LaunchType:       "terminal",
			SuggestedCommand: fmt.Sprintf("mkdir -p ./dist && go build -o ./dist/%s %s", cleanName, sourcePath),
		}

	case ".rb":
		return BuildSuggestion{
			DetectedLanguage: "Ruby Script (Zip Package)",
			ArtifactType:     "zip",
			ArtifactPath:     fmt.Sprintf("dist/%s.zip", cleanName),
			RunCommand:       fmt.Sprintf("ruby %s", filepath.Base(sourcePath)),
			LaunchType:       "terminal",
			SuggestedCommand: fmt.Sprintf("mkdir -p ./dist && zip -j ./dist/%s.zip %s", cleanName, sourcePath),
		}

	case ".zip":
		return BuildSuggestion{
			DetectedLanguage: "Pre-built ZIP Archive",
			ArtifactType:     "zip",
			ArtifactPath:     sourcePath,
			RunCommand:       cleanName,
			LaunchType:       "gui",
			SuggestedCommand: "", // No build required
		}

	default:
		// Check if it's already an executable binary or unknown
		return BuildSuggestion{
			DetectedLanguage: "Pre-built Binary / Unknown",
			ArtifactType:     "binary",
			ArtifactPath:     sourcePath,
			RunCommand:       filepath.Base(sourcePath),
			LaunchType:       "gui",
			SuggestedCommand: "",
		}
	}
}

// ExecuteBuild runs the build command in the apps directory and returns output
func ExecuteBuild(appsDir string, app AppItem) (string, error) {
	cmdStr := app.BuildCommand
	if cmdStr == "" && app.SourcePath != "" {
		suggestion := SuggestBuild(app.SourcePath, app.Name)
		cmdStr = suggestion.SuggestedCommand
	}

	if cmdStr == "" {
		// Nothing to build (pre-built binary or zip)
		targetAbs := filepath.Join(appsDir, app.ArtifactPath)
		if _, err := os.Stat(targetAbs); err != nil {
			return "", fmt.Errorf("artifact does not exist: %s", app.ArtifactPath)
		}
		return "No build command required. Artifact verified.", nil
	}

	cmd := exec.Command("bash", "-c", cmdStr)
	cmd.Dir = appsDir
	outputBytes, err := cmd.CombinedOutput()
	output := string(outputBytes)

	if err != nil {
		return output, fmt.Errorf("build failed: %w\n%s", err, output)
	}

	// Verify artifact was created
	targetAbs := filepath.Join(appsDir, app.ArtifactPath)
	if _, err := os.Stat(targetAbs); err != nil {
		return output, fmt.Errorf("build succeeded but artifact not found at %s: %w", app.ArtifactPath, err)
	}

	return output, nil
}
