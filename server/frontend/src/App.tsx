import { useState, useEffect, useRef } from "react";
import {
  Container,
  Stack,
  Group,
  Title,
  Text,
  Badge,
  Button,
  Card,
  TextInput,
  CopyButton,
  Code,
  ScrollArea,
  Textarea,
  SimpleGrid,
  Paper,
  Box,
  Divider,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  GetServerStatus,
  UpdatePort,
  ToggleServer,
  GetRawManifestJSON,
  SaveRawManifestJSON,
  GetManifest,
} from "../wailsjs/go/main/App";
import { EventsOn } from "../wailsjs/runtime/runtime";
import { main } from "../wailsjs/go/models";

interface LogItem {
  timestamp: string;
  level: string;
  message: string;
}

function App() {
  const [serverStatus, setServerStatus] = useState<main.ServerStatus | null>(null);
  const [portInput, setPortInput] = useState<string>("");
  const [apps, setApps] = useState<main.AppItem[]>([]);
  const [rawJson, setRawJson] = useState<string>("");
  const [isJsonMode, setIsJsonMode] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const logViewport = useRef<HTMLDivElement>(null);

  const loadAllData = async () => {
    try {
      const status = await GetServerStatus();
      setServerStatus(status);
      setPortInput(status.port);

      const appList = await GetManifest();
      setApps(appList || []);

      const jsonStr = await GetRawManifestJSON();
      setRawJson(jsonStr);
    } catch (err: any) {
      console.error("Failed to load initial data:", err);
      notifications.show({
        title: "エラー",
        message: err.message || String(err),
        color: "red",
      });
    }
  };

  useEffect(() => {
    loadAllData();

    // Listen to real-time server log events from Go backend
    const cancelEvents = EventsOn("server-log", (data: LogItem) => {
      setLogs((prev) => [...prev.slice(-99), data]);
      if (logViewport.current) {
        logViewport.current.scrollTo({
          top: logViewport.current.scrollHeight,
          behavior: "smooth",
        });
      }
    });

    return () => {
      if (cancelEvents) cancelEvents();
    };
  }, []);

  const handleToggleServer = async () => {
    if (!serverStatus) return;
    try {
      await ToggleServer(!serverStatus.running);
      const updated = await GetServerStatus();
      setServerStatus(updated);
      notifications.show({
        title: updated.running ? "サーバー起動" : "サーバー停止",
        message: updated.running
          ? `ポート ${updated.port} で配信を開始しました`
          : "配信サーバーを停止しました",
        color: updated.running ? "teal" : "gray",
      });
    } catch (err: any) {
      notifications.show({
        title: "操作失敗",
        message: err.message || String(err),
        color: "red",
      });
    }
  };

  const handleUpdatePort = async () => {
    if (!portInput) return;
    try {
      await UpdatePort(portInput);
      const updated = await GetServerStatus();
      setServerStatus(updated);
      notifications.show({
        title: "ポート変更完了",
        message: `ポート番号を ${portInput} に変更して再起動しました`,
        color: "teal",
      });
    } catch (err: any) {
      notifications.show({
        title: "ポート変更エラー",
        message: err.message || String(err),
        color: "red",
      });
    }
  };

  const handleSaveJson = async () => {
    try {
      await SaveRawManifestJSON(rawJson);
      const updatedApps = await GetManifest();
      setApps(updatedApps || []);
      notifications.show({
        title: "保存完了",
        message: "マニフェスト (manifest.json) を更新しました",
        color: "teal",
      });
    } catch (err: any) {
      notifications.show({
        title: "保存失敗 (JSON構文エラー等)",
        message: err.message || String(err),
        color: "red",
      });
    }
  };

  return (
    <Container size="md" p="md">
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Box>
            <Title order={2}>App Launcher Server</Title>
            <Text c="dimmed" size="xs">
              アプリ一括配信管理サーバー
            </Text>
          </Box>

          <Group gap="xs">
            {serverStatus && (
              <Badge
                color={serverStatus.running ? "teal" : "red"}
                variant="light"
                size="lg"
              >
                {serverStatus.running
                  ? `稼働中 (Port ${serverStatus.port})`
                  : "停止中"}
              </Badge>
            )}

            <Button
              color={serverStatus?.running ? "red" : "teal"}
              variant="filled"
              size="xs"
              onClick={handleToggleServer}
            >
              {serverStatus?.running ? "停止" : "起動"}
            </Button>
          </Group>
        </Group>

        {/* Network & Connection Info */}
        <Card shadow="sm" radius="md" withBorder padding="md">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={600} size="sm">
                📡 各展示端末（クライアント）に入力する接続URL
              </Text>
            </Group>
            <Text c="dimmed" size="xs">
              クライアント端末のランチャーに以下のアドレスを入力すると、このサーバーに接続されます。
            </Text>

            <Stack gap="xs" mt="4">
              {serverStatus?.urls && serverStatus.urls.length > 0 ? (
                serverStatus.urls.map((url, idx) => (
                  <Paper
                    key={idx}
                    withBorder
                    p="xs"
                    radius="sm"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Group gap="xs">
                      <Code fw={700} fz="sm" c="blue.4">
                        {url}
                      </Code>
                      <Badge
                        size="xs"
                        variant="dot"
                        color={url.includes("localhost") ? "gray" : "teal"}
                      >
                        {url.includes("localhost") ? "Local" : "LAN Wi-Fi/有線"}
                      </Badge>
                    </Group>

                    <CopyButton value={url} timeout={2000}>
                      {({ copied, copy }) => (
                        <Button
                          color={copied ? "teal" : "gray"}
                          variant="light"
                          size="compact-xs"
                          onClick={copy}
                        >
                          {copied ? "コピー完了" : "コピー"}
                        </Button>
                      )}
                    </CopyButton>
                  </Paper>
                ))
              ) : (
                <Text size="sm" c="dimmed">
                  IPアドレスを取得中...
                </Text>
              )}
            </Stack>

            <Divider my="xs" />

            <Group gap="xs" align="flex-end">
              <TextInput
                label="待受ポート"
                size="xs"
                value={portInput}
                onChange={(e) => setPortInput(e.currentTarget.value)}
                w={100}
              />
              <Button
                variant="light"
                size="xs"
                onClick={handleUpdatePort}
              >
                ポート変更 & 再起動
              </Button>
            </Group>
          </Stack>
        </Card>

        {/* Applications List */}
        <Card shadow="sm" radius="md" withBorder padding="md">
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <Text fw={600} size="sm">
                📦 登録アプリケーション一覧 ({apps.length} 件)
              </Text>
              <Button
                variant="subtle"
                size="compact-xs"
                onClick={() => setIsJsonMode(!isJsonMode)}
              >
                {isJsonMode ? "カード表示に戻る" : "JSON直接編集"}
              </Button>
            </Group>

            {isJsonMode ? (
              <Stack gap="xs">
                <Text c="dimmed" size="xs">
                  <code>manifest.json</code> を直接編集して保存できます。
                </Text>
                <Textarea
                  value={rawJson}
                  onChange={(e) => setRawJson(e.currentTarget.value)}
                  autosize
                  minRows={10}
                  maxRows={20}
                  styles={{ input: { fontFamily: "monospace", fontSize: "12px" } }}
                />
                <Group gap="xs">
                  <Button size="xs" onClick={handleSaveJson}>
                    保存する
                  </Button>
                  <Button
                    variant="default"
                    size="xs"
                    onClick={() => loadAllData()}
                  >
                    リロード
                  </Button>
                </Group>
              </Stack>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                {apps.map((app, index) => (
                  <Card
                    key={index}
                    shadow="none"
                    radius="sm"
                    withBorder
                    padding="sm"
                  >
                    <Stack gap="xs" justify="space-between" h="100%">
                      <Box>
                        <Group justify="space-between" align="flex-start" mb="4">
                          <Text fw={600} size="sm">
                            {app.name}
                          </Text>
                          <Badge size="xs" variant="light" color="blue">
                            {app.artifact_type}
                          </Badge>
                        </Group>
                        <Text c="dimmed" size="xs" lineClamp={2}>
                          {app.description || "説明なし"}
                        </Text>
                      </Box>

                      <Paper bg="dark.7" p="xs" radius="xs">
                        <Group gap="4">
                          <Text size="11px" c="dimmed" fw={600}>
                            Run:
                          </Text>
                          <Code fz="11px">{app.run_command}</Code>
                        </Group>
                        <Group gap="4" mt="2">
                          <Text size="11px" c="dimmed" fw={600}>
                            Path:
                          </Text>
                          <Code fz="11px">{app.artifact_path}</Code>
                        </Group>
                      </Paper>
                    </Stack>
                  </Card>
                ))}
              </SimpleGrid>
            )}
          </Stack>
        </Card>

        {/* Real-time Delivery Log Console */}
        <Card shadow="sm" radius="md" withBorder padding="md">
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Text fw={600} size="sm">
                📜 配信ログ (リアルタイム)
              </Text>
              <Button
                variant="subtle"
                size="compact-xs"
                color="gray"
                onClick={() => setLogs([])}
              >
                クリア
              </Button>
            </Group>

            <Paper
              bg="dark.9"
              p="xs"
              radius="sm"
              withBorder
              style={{ borderColor: "var(--mantine-color-dark-5)" }}
            >
              <ScrollArea.Autosize mah={180} viewportRef={logViewport}>
                {logs.length === 0 ? (
                  <Text size="xs" c="dimmed" p="xs">
                    リクエスト待機中... (クライアントからの接続ログがここにリアルタイム表示されます)
                  </Text>
                ) : (
                  <Stack gap="2">
                    {logs.map((log, index) => (
                      <Group gap="xs" key={index} wrap="nowrap" align="flex-start">
                        <Text size="11px" c="dimmed" ff="monospace" style={{ flexShrink: 0 }}>
                          [{log.timestamp}]
                        </Text>
                        <Badge
                          size="xs"
                          variant="filled"
                          color={log.level === "ERROR" ? "red" : "blue"}
                          style={{ flexShrink: 0, textTransform: "none" }}
                        >
                          {log.level}
                        </Badge>
                        <Text size="11px" ff="monospace" style={{ wordBreak: "break-all" }}>
                          {log.message}
                        </Text>
                      </Group>
                    ))}
                  </Stack>
                )}
              </ScrollArea.Autosize>
            </Paper>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}

export default App;
