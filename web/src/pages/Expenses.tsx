import { Title, Text, Stack, Paper } from '@mantine/core';
import { IconReceipt } from '@tabler/icons-react';

export function Expenses() {
  return (
    <Stack gap="lg">
      <Title order={2}>Expenses</Title>
      <Paper withBorder p="xl" radius="md" ta="center">
        <IconReceipt size={48} stroke={1.5} color="gray" />
        <Text c="dimmed" mt="md">
          No expenses yet. Add your first expense to get started.
        </Text>
      </Paper>
    </Stack>
  );
}
