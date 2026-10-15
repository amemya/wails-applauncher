import { useState, useEffect } from "react";

// ... (App interface remains the same)
interface App {
  name: string;
  description: string;
  artifact_type: string;
  build_command: string;
  artifact_path: string;
  run_command: string;
}

interface ServerConfig {
  port: string;
}

function App() {
  const [manifestText, setManifestText] = useState("");
  const [serverConfig, setServerConfig] = useState<ServerConfig>({ port: "" });
  const [portInput, setPortInput] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [manifestSaveStatus, setManifestSaveStatus] = useState<string | null>(
    null,
  );
  const [portSaveStatus, setPortSaveStatus] = useState<string | null>(null);
  const [restartStatus, setRestartStatus] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch manifest
        const manifestResponse = await fetch("/api/admin/manifest");
        if (!manifestResponse.ok) {
          throw new Error(`HTTP error! status: ${manifestResponse.status}`);
        }
        const manifestData = await manifestResponse.json();
        setManifestText(JSON.stringify(manifestData, null, 2));

        // Fetch server config
        const configResponse = await fetch("/api/admin/server/config");
        if (!configResponse.ok) {
          throw new Error(`HTTP error! status: ${configResponse.status}`);
        }
        const configData = await configResponse.json();
        setServerConfig(configData);
        setPortInput(configData.port);
      } catch (e) {
        if (e instanceof Error) {
          setError(e.message);
        } else {
          setError("An unknown error occurred");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleManifestSave = async () => {
    setManifestSaveStatus("Saving...");
    try {
      JSON.parse(manifestText); // Basic JSON validation
      const response = await fetch("/api/admin/manifest", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: manifestText,
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save: ${errorText}`);
      }
      setManifestSaveStatus("Manifest saved successfully!");
    } catch (e) {
      if (e instanceof Error) {
        setManifestSaveStatus(`Error: ${e.message}`);
      } else {
        setManifestSaveStatus("An unknown error occurred while saving.");
      }
    }
  };

  const handlePortSave = async () => {
    setPortSaveStatus("Saving...");
    try {
      const response = await fetch("/api/admin/server/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: portInput }),
      });
      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`Failed to save: ${responseText}`);
      }
      setPortSaveStatus(responseText);
      // Also update the displayed config from server
      setServerConfig({ port: portInput });
    } catch (e) {
      if (e instanceof Error) {
        setPortSaveStatus(`Error: ${e.message}`);
      } else {
        setPortSaveStatus("An unknown error occurred while saving.");
      }
    }
  };

  const handleRestart = async () => {
    setRestartStatus("Sending restart command...");
    try {
      const response = await fetch("/api/admin/server/restart", {
        method: "POST",
      });
      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`Restart command failed: ${responseText}`);
      }
      setRestartStatus(
        "Server is restarting... Page will reload in 5 seconds.",
      );

      // Reload the page to the new port after a delay
      setTimeout(() => {
        const newUrl = `${window.location.protocol}//${window.location.hostname}:${portInput}/admin/`;
        window.location.href = newUrl;
      }, 5000);
    } catch (e) {
      if (e instanceof Error) {
        setRestartStatus(`Error: ${e.message}`);
      } else {
        setRestartStatus("An unknown error occurred during restart.");
      }
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "auto" }}>
      <h1>Server Admin</h1>

      <hr style={{ margin: "40px 0" }} />

      <h2>Server Settings</h2>
      <p>
        Current active port: <strong>{serverConfig.port}</strong> (Changes
        require server restart)
      </p>
      <div>
        <label htmlFor="port-input">New Port:</label>
        <input
          id="port-input"
          type="text"
          value={portInput}
          onChange={(e) => setPortInput(e.target.value)}
          style={{ marginLeft: "10px", marginRight: "10px" }}
        />
        <button onClick={handlePortSave}>Save Port</button>
        <button onClick={handleRestart} style={{ marginLeft: "10px" }}>
          Restart Server
        </button>
        {portSaveStatus && <p>{portSaveStatus}</p>}
        {restartStatus && <p>{restartStatus}</p>}
      </div>

      <hr style={{ margin: "40px 0" }} />

      <h2>Edit Manifest</h2>
      <textarea
        value={manifestText}
        onChange={(e) => setManifestText(e.target.value)}
        rows={25}
        style={{ width: "100%", fontFamily: "monospace" }}
      />
      <div>
        <button onClick={handleManifestSave}>Save Manifest</button>
        {manifestSaveStatus && <p>{manifestSaveStatus}</p>}
      </div>
    </div>
  );
}

export default App;
