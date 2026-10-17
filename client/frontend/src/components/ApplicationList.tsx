import { Card, Text, Button, Group, Stack, Badge, Box } from "@mantine/core";
import { Application } from "../hooks/useApplications";

interface ApplicationListProps {
  applications: Application[];
  handleShowDetails: (description: string) => void;
  handleRunApplication: (app: Application) => void;
}

export function ApplicationList({
  applications,
  handleShowDetails,
  handleRunApplication,
}: ApplicationListProps) {
  if (applications.length === 0) {
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Text c="dimmed" style={{ textAlign: "center" }}>
          サーバーに登録されているアプリケーションがありません。
        </Text>
      </Card>
    );
  }

  return (
    <Stack gap="sm">
      {applications.map((app, index) => (
        <Card shadow="sm" padding="md" radius="md" withBorder key={index}>
          <Group justify="space-between" align="center">
            <Box>
              <Group gap="xs" align="center">
                <Text fw={600} size="md">
                  {app.name}
                </Text>
                {app.launch_type && (
                  <Badge
                    size="xs"
                    variant="dot"
                    color={app.launch_type === "gui" ? "violet" : "gray"}
                  >
                    {app.launch_type === "gui" ? "GUI 🎮" : "CUI 💻"}
                  </Badge>
                )}
                <Badge size="xs" variant="light" color="blue">
                  {app.artifact_type}
                </Badge>
              </Group>
              <Text c="dimmed" size="xs" mt="4" lineClamp={1}>
                {app.description || "説明なし"}
              </Text>
            </Box>

            <Group gap="xs">
              <Button
                variant="light"
                size="xs"
                onClick={() => handleShowDetails(app.description)}
              >
                詳細
              </Button>
              <Button
                size="xs"
                color={app.launch_type === "gui" ? "violet" : "blue"}
                onClick={() => handleRunApplication(app)}
              >
                {app.launch_type === "gui" ? "起動 🎮" : "実行 💻"}
              </Button>
            </Group>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
