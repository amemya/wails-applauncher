import { TextInput, Button, Group, Card } from "@mantine/core";

interface ServerAddressFormProps {
  newServerAddress: string;
  setNewServerAddress: (address: string) => void;
  handleSaveServerAddress: () => void;
  onRefresh: () => void;
  loading?: boolean;
}

export function ServerAddressForm({
  newServerAddress,
  setNewServerAddress,
  handleSaveServerAddress,
  onRefresh,
  loading = false,
}: ServerAddressFormProps) {
  return (
    <Card shadow="sm" padding="md" radius="md" withBorder>
      <Group align="flex-end">
        <TextInput
          label="Server Address"
          placeholder="http://192.168.x.x:8080"
          value={newServerAddress}
          onChange={(event) => setNewServerAddress(event.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Button onClick={handleSaveServerAddress}>
          保存
        </Button>
        <Button
          variant="light"
          color="teal"
          onClick={onRefresh}
          loading={loading}
        >
          🔄 再取得
        </Button>
      </Group>
    </Card>
  );
}
