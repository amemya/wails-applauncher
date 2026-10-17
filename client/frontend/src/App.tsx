import { Container, Title, Stack } from "@mantine/core";
import { useServerAddress } from "./hooks/useServerAddress";
import { useApplications } from "./hooks/useApplications"; // Renamed
import { ServerAddressForm } from "./components/ServerAddressForm"; // Restored
import { ApplicationList } from "./components/ApplicationList";
import { OutputDisplay } from "./components/OutputDisplay";
import { useEffect } from "react";

function App() {
  // Restored server address logic
  const {
    serverAddress,
    newServerAddress,
    setNewServerAddress,
    handleSaveServerAddress,
  } = useServerAddress();

  // Applications logic now depends on the server address
  const {
    applications,
    resultText,
    loading,
    fetchApplications,
    handleShowDetails,
    handleRunApplication,
  } = useApplications(serverAddress);

  // Fetch applications whenever the address changes
  useEffect(() => {
    fetchApplications();
  }, [serverAddress]);

  return (
    <Container p="md">
      <Stack>
        <Title order={1} style={{ textAlign: "center" }}>
          Wails App Launcher
        </Title>

        {/* Server address form with refresh button */}
        <ServerAddressForm
          newServerAddress={newServerAddress}
          setNewServerAddress={setNewServerAddress}
          handleSaveServerAddress={handleSaveServerAddress}
          onRefresh={() => fetchApplications(true)}
          loading={loading}
        />

        <ApplicationList
          applications={applications}
          handleShowDetails={handleShowDetails}
          handleRunApplication={handleRunApplication} // Changed
        />

        <OutputDisplay resultText={resultText} />
      </Stack>
    </Container>
  );
}

export default App;
