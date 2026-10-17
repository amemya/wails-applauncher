import { useState, useCallback } from "react";
import { notifications } from "@mantine/notifications";
import { SaveAndRunArtifact } from "../../wailsjs/go/main/App";
import { getApplications, getArtifact } from "../api/client";

export interface Application {
  name: string;
  description: string;
  artifact_type: string;
  build_command: string;
  artifact_path: string;
  run_command: string;
  launch_type?: string;
}

export function useApplications(serverAddress: string) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [resultText, setResultText] = useState<string>(
    "Select an application to run, or view details",
  );

  const [loading, setLoading] = useState<boolean>(false);

  const fetchApplications = useCallback(
    (notifySuccess = false) => {
      if (!serverAddress) return;
      setLoading(true);
      getApplications(serverAddress)
        .then((data) => {
          setApplications(data);
          if (notifySuccess) {
            notifications.show({
              title: "再取得完了",
              message: `${data.length} 件のアプリケーションを取得しました`,
              color: "teal",
            });
          }
        })
        .catch((err) => {
          console.error("Failed to fetch applications:", err);
          notifications.show({
            title: "取得エラー",
            message: `アプリケーションを取得できませんでした: ${err.message}`,
            color: "red",
          });
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [serverAddress],
  );

  const handleShowDetails = (description: string) => {
    setResultText(description);
  };

  const handleRunApplication = async (app: Application) => {
    if (!serverAddress) {
      notifications.show({
        title: "Error",
        message: "Server address is not set.",
        color: "red",
      });
      return;
    }
    setResultText(`Preparing to run '${app.name}'...`);

    try {
      // 1. Fetch artifact from server using the API client
      const blob = await getArtifact(serverAddress, app.name);
      const fileData = new Uint8Array(await blob.arrayBuffer());

      // 2. Pass data to client's Go backend to save and run directly (GUI) or in terminal
      setResultText(`Executing '${app.name}'...`);
      const output = await SaveAndRunArtifact(
        app.artifact_type === "zip",
        Array.from(fileData),
        app.run_command,
        app.launch_type || "terminal",
      );

      // 3. Display result
      setResultText(output);
      notifications.show({
        title: "Execution Finished",
        message: `'${app.name}' finished running.`,
        color: "green",
      });
    } catch (err: any) {
      console.error("Failed to run application:", err);
      setResultText(err.message);
      notifications.show({
        title: "Error",
        message: err.message,
        color: "red",
      });
    }
  };

  return {
    applications,
    resultText,
    loading,
    fetchApplications,
    handleShowDetails,
    handleRunApplication,
  };
}
