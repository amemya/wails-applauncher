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
  Modal,
  Select,
  SegmentedControl,
  Checkbox,
  ActionIcon,
  Collapse,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  GetServerStatus,
  UpdatePort,
  ToggleServer,
  GetRawManifestJSON,
  SaveRawManifestJSON,
  GetManifest,
  SelectAppsDirectory,
  OpenAppsDirectory,
  SuggestBuildParameters,
  BuildApplication,
  RegisterApplication,
  DeleteApplication,
  ListSourceFiles,
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

  // Add App Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [sourceFiles, setSourceFiles] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [formName, setFormName] = useState<string>("");
  const [formDesc, setFormDesc] = useState<string>("");
  const [formLaunchType, setFormLaunchType] = useState<string>("gui");
  const [formArtifactType, setFormArtifactType] = useState<string>("binary");
  const [formBuildCmd, setFormBuildCmd] = useState<string>("");
  const [formArtifactPath, setFormArtifactPath] = useState<string>("");
  const [formRunCmd, setFormRunCmd] = useState<string>("");
  const [detectedLang, setDetectedLang] = useState<string>("");
  const [autoBuildChecked, setAutoBuildChecked] = useState<boolean>(true);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Build Log Modal states
  const [logModalOpen, setLogModalOpen] = useState<boolean>(false);
  const [currentBuildLog, setCurrentBuildLog] = useState<string>("");
  const [buildingAppName, setBuildingAppName] = useState<string | null>(null);

  const loadAllData = async () => {
    try {
      const status = await GetServerStatus();
      setServerStatus(status);
      setPortInput(status.port);

      const appList = await GetManifest();
      setApps(appList || []);

      const jsonStr = await GetRawManifestJSON();
      setRawJson(jsonStr);

      const files = await ListSourceFiles();
      setSourceFiles(files || []);
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

  const handleSelectAppsDir = async () => {
    try {
      const selected = await SelectAppsDirectory();
      if (selected) {
        await loadAllData();
        notifications.show({
          title: "作品ディレクトリを変更しました",
          message: selected,
          color: "teal",
        });
      }
    } catch (err: any) {
      notifications.show({
        title: "ディレクトリ選択エラー",
        message: err.message || String(err),
        color: "red",
      });
    }
  };

  const handleOpenAppsDir = async () => {
    try {
      await OpenAppsDirectory();
    } catch (err: any) {
      notifications.show({
        title: "フォルダを開けませんでした",
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

  // Open modal and refresh candidate files
  const handleOpenAddModal = async () => {
    try {
      const files = await ListSourceFiles();
      setSourceFiles(files || []);
      setSelectedSource(null);
      setFormName("");
      setFormDesc("");
      setFormBuildCmd("");
      setFormArtifactPath("");
      setFormRunCmd("");
      setDetectedLang("");
      setShowAdvanced(false);
      setAutoBuildChecked(true);
      setIsAddModalOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  // When source file selection changes, auto-suggest parameters
  const handleSourceChange = async (sourcePath: string | null) => {
    setSelectedSource(sourcePath);
    if (!sourcePath) return;

    try {
      const suggestion = await SuggestBuildParameters(sourcePath, formName);
      setDetectedLang(suggestion.detected_language);
      setFormArtifactType(suggestion.artifact_type);
      setFormBuildCmd(suggestion.suggested_command);
      setFormArtifactPath(suggestion.artifact_path);
      setFormRunCmd(suggestion.run_command);
      setFormLaunchType(suggestion.launch_type);

      if (!formName) {
        const base = sourcePath.split("/").pop() || "";
        const nameWithoutExt = base.replace(/\.[^/.]+$/, "");
        setFormName(nameWithoutExt);
      }
    } catch (err) {
      console.error("Suggestion error:", err);
    }
  };

  // Register app submission
  const handleSubmitRegister = async () => {
    if (!formName.trim()) {
      notifications.show({ title: "入力エラー", message: "アプリ名を入力してください", color: "red" });
      return;
    }

    setSubmitting(true);
    try {
      const newApp = new main.AppItem({
        name: formName.trim(),
        description: formDesc.trim(),
        source_path: selectedSource || "",
        artifact_type: formArtifactType,
        build_command: formBuildCmd.trim(),
        artifact_path: formArtifactPath.trim() || `dist/${formName.trim()}`,
        run_command: formRunCmd.trim() || formName.trim(),
        launch_type: formLaunchType,
      });

      const log = await RegisterApplication(newApp, autoBuildChecked);
      setIsAddModalOpen(false);
      await loadAllData();

      notifications.show({
        title: "登録成功",
        message: `'${formName}' をマニフェストに登録しました`,
        color: "teal",
      });

      if (log) {
        setCurrentBuildLog(log);
        setBuildingAppName(formName);
        setLogModalOpen(true);
      }
    } catch (err: any) {
      notifications.show({
        title: "登録/ビルド失敗",
        message: err.message || String(err),
        color: "red",
      });
      if (err.message && err.message.includes("build failed")) {
        setCurrentBuildLog(err.message);
        setBuildingAppName(formName);
        setLogModalOpen(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Manual rebuild existing app
  const handleRebuildApp = async (appName: string) => {
    setBuildingAppName(appName);
    try {
      notifications.show({
        id: "building-notif",
        loading: true,
        title: "ビルド中",
        message: `'${appName}' のビルドを実行しています...`,
        autoClose: false,
        withCloseButton: false,
      });

      const log = await BuildApplication(appName);
      notifications.update({
        id: "building-notif",
        color: "teal",
        title: "ビルド成功",
        message: `'${appName}' の成果物を生成しました`,
        loading: false,
        autoClose: 3000,
      });

      await loadAllData();
      setCurrentBuildLog(log);
      setLogModalOpen(true);
    } catch (err: any) {
      notifications.update({
        id: "building-notif",
        color: "red",
        title: "ビルド失敗",
        message: err.message || String(err),
        loading: false,
        autoClose: 5000,
      });
      setCurrentBuildLog(err.message || String(err));
      setLogModalOpen(true);
    }
  };

  // Delete app
  const handleDeleteApp = async (appName: string) => {
    if (!confirm(`'${appName}' をマニフェストから削除しますか？`)) return;
    try {
      await DeleteApplication(appName);
      await loadAllData();
      notifications.show({
        title: "削除完了",
        message: `'${appName}' を削除しました`,
        color: "teal",
      });
    } catch (err: any) {
      notifications.show({
        title: "削除エラー",
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

        {/* Apps Directory Location Settings */}
        <Card shadow="sm" radius="md" withBorder padding="md">
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Text fw={600} size="sm">
                📁 配信作品ディレクトリ (配布フォルダ)
              </Text>
              <Group gap="xs">
                <Button
                  variant="light"
                  size="xs"
                  onClick={handleSelectAppsDir}
                >
                  📁 フォルダを変更
                </Button>
                <Button
                  variant="default"
                  size="xs"
                  onClick={handleOpenAppsDir}
                >
                  📂 フォルダを開く
                </Button>
              </Group>
            </Group>
            <Text c="dimmed" size="xs">
              USBメモリやデスクトップなど、任意の作品フォルダを指定できます。フォルダ内の <code>manifest.json</code> と成果物が自動で読み込まれます。
            </Text>

            <Paper bg="dark.7" p="xs" radius="xs" withBorder>
              <Code fw={600} fz="xs" style={{ wordBreak: "break-all" }}>
                {serverStatus?.apps_dir || "未設定"}
              </Code>
            </Paper>
          </Stack>
        </Card>

        {/* Applications List */}
        <Card shadow="sm" radius="md" withBorder padding="md">
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <Text fw={600} size="sm">
                📦 登録アプリケーション一覧 ({apps.length} 件)
              </Text>
              <Group gap="xs">
                <Button
                  color="blue"
                  size="xs"
                  onClick={handleOpenAddModal}
                >
                  ＋ 新規アプリ登録
                </Button>
                <Button
                  variant="subtle"
                  size="compact-xs"
                  onClick={() => setIsJsonMode(!isJsonMode)}
                >
                  {isJsonMode ? "カード表示に戻る" : "JSON直接編集"}
                </Button>
              </Group>
            </Group>

            {isJsonMode ? (
              <Stack gap="xs">
                <Text c="dimmed" size="xs">
                  選択中ディレクトリ内の <code>manifest.json</code> を直接編集して保存できます。
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
            ) : apps.length === 0 ? (
              <Paper p="md" withBorder bg="dark.8" style={{ textAlign: "center" }}>
                <Text c="dimmed" size="sm">
                  このディレクトリにはまだ登録されたアプリケーションがありません。
                </Text>
                <Text c="dimmed" size="xs" mt="xs">
                  「＋ 新規アプリ登録」ボタンから部員のソース作品を登録するか、「JSON直接編集」を行ってください。
                </Text>
              </Paper>
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
                          <Group gap="4">
                            {app.artifact_exists ? (
                              <Badge size="xs" color="teal" variant="light">
                                Ready 🟢
                              </Badge>
                            ) : (
                              <Badge size="xs" color="gray" variant="light">
                                未ビルド ⚪
                              </Badge>
                            )}
                            {app.launch_type && (
                              <Badge size="xs" variant="dot" color={app.launch_type === "gui" ? "violet" : "gray"}>
                                {app.launch_type.toUpperCase()}
                              </Badge>
                            )}
                            <Badge size="xs" variant="light" color="blue">
                              {app.artifact_type}
                            </Badge>
                          </Group>
                        </Group>
                        <Text c="dimmed" size="xs" lineClamp={2}>
                          {app.description || "説明なし"}
                        </Text>
                      </Box>

                      <Paper bg="dark.7" p="xs" radius="xs">
                        {app.source_path && (
                          <Group gap="4">
                            <Text size="11px" c="dimmed" fw={600}>
                              Src:
                            </Text>
                            <Code fz="11px">{app.source_path}</Code>
                          </Group>
                        )}
                        <Group gap="4" mt="2">
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

                      <Group justify="space-between" mt="xs">
                        <Button
                          variant="light"
                          size="compact-xs"
                          color="blue"
                          onClick={() => handleRebuildApp(app.name)}
                        >
                          🔨 再ビルド
                        </Button>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          onClick={() => handleDeleteApp(app.name)}
                        >
                          🗑️
                        </ActionIcon>
                      </Group>
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

      {/* Add Application Modal */}
      <Modal
        opened={isAddModalOpen}
        onClose={() => !submitting && setIsAddModalOpen(false)}
        title="新規アプリケーションの登録・自動ビルド"
        size="lg"
      >
        <Stack gap="sm">
          <Select
            label="ソースファイル / 成果物"
            placeholder="配布フォルダ内のファイルを選択"
            data={sourceFiles.map((f) => ({ value: f, label: f }))}
            value={selectedSource}
            onChange={handleSourceChange}
            searchable
            clearable
            description="選択すると言語を自動判定し、最適なビルド設定が自動補完されます"
          />

          {detectedLang && (
            <Paper p="xs" bg="dark.7" radius="xs">
              <Group gap="xs">
                <Text size="xs" fw={600} c="dimmed">
                  検出言語:
                </Text>
                <Badge size="xs" color="teal">
                  {detectedLang}
                </Badge>
              </Group>
            </Paper>
          )}

          <TextInput
            label="作品名 (表示名)"
            placeholder="例: 超神シューティング"
            value={formName}
            onChange={(e) => setFormName(e.currentTarget.value)}
            required
          />

          <TextInput
            label="説明"
            placeholder="例: 部員がPythonで作成した2Dゲーム"
            value={formDesc}
            onChange={(e) => setFormDesc(e.currentTarget.value)}
          />

          <Box>
            <Text size="xs" fw={500} mb="4">
              起動タイプ (展示端末側での起動方法)
            </Text>
            <SegmentedControl
              size="xs"
              value={formLaunchType}
              onChange={setFormLaunchType}
              data={[
                { label: "GUI (ゲーム直接起動)", value: "gui" },
                { label: "CUI (ターミナル起動)", value: "terminal" },
              ]}
              fullWidth
            />
          </Box>

          <Checkbox
            label="登録と同時に今すぐ自動バイナリ化（ビルド）を実行する"
            checked={autoBuildChecked}
            onChange={(e) => setAutoBuildChecked(e.currentTarget.checked)}
            description="事前ビルドしておくと、展示端末からの初回ダウンロードが一瞬で完了します"
            size="xs"
            mt="xs"
          />

          <Button
            variant="subtle"
            size="compact-xs"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ alignSelf: "flex-start" }}
          >
            {showAdvanced ? "▼ 高度な設定を隠す" : "▶ 高度な設定 (ビルドコマンドを手動上書き)"}
          </Button>

          <Collapse in={showAdvanced}>
            <Stack gap="xs" p="xs" bg="dark.8" style={{ borderRadius: "6px" }}>
              <Text size="xs" c="dimmed">
                ※自動判定で失敗する場合や、特殊な引数が必要な場合はコマンドを手動編集できます。
              </Text>
              <Textarea
                label="ビルドコマンド (上書き用)"
                value={formBuildCmd}
                onChange={(e) => setFormBuildCmd(e.currentTarget.value)}
                placeholder="例: pyinstaller --onefile ... または gcc -o ..."
                autosize
                minRows={2}
                styles={{ input: { fontFamily: "monospace", fontSize: "11px" } }}
              />
              <Group grow>
                <TextInput
                  label="成果物パス"
                  size="xs"
                  value={formArtifactPath}
                  onChange={(e) => setFormArtifactPath(e.currentTarget.value)}
                />
                <TextInput
                  label="実行コマンド"
                  size="xs"
                  value={formRunCmd}
                  onChange={(e) => setFormRunCmd(e.currentTarget.value)}
                />
              </Group>
            </Stack>
          </Collapse>

          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              onClick={() => setIsAddModalOpen(false)}
              disabled={submitting}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleSubmitRegister}
              loading={submitting}
              color="teal"
            >
              {autoBuildChecked ? "ビルドして登録" : "登録する"}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Build Log Modal */}
      <Modal
        opened={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        title={`ビルド出力ログ (${buildingAppName || "ビルド"})`}
        size="lg"
      >
        <Stack gap="xs">
          <Paper bg="dark.9" p="xs" radius="xs" withBorder>
            <ScrollArea.Autosize mah={300}>
              <Code block fz="xs" style={{ whiteSpace: "pre-wrap" }}>
                {currentBuildLog || "出力ログはありません"}
              </Code>
            </ScrollArea.Autosize>
          </Paper>
          <Group justify="flex-end">
            <Button variant="default" size="xs" onClick={() => setLogModalOpen(false)}>
              閉じる
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default App;
