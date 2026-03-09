import {
  Modal,
  Table,
  Text,
  Group,
  Button,
  Stack,
} from '@mantine/core';
import { formatCents } from '../lib/format';
import type { Expense } from '../lib/types';

interface BulkReimburseConfirmModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  expenses: Expense[];
  loading: boolean;
}

export function BulkReimburseConfirmModal({
  opened,
  onClose,
  onConfirm,
  expenses,
  loading,
}: BulkReimburseConfirmModalProps) {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Confirm Bulk Reimbursement"
      size="lg"
      transitionProps={{ duration: 0 }}
    >
      <Stack gap="md">
        <Text size="sm">
          You are about to mark {expenses.length}{' '}
          {expenses.length === 1 ? 'expense' : 'expenses'} as reimbursed:
        </Text>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Vendor</Table.Th>
              <Table.Th>Paid By</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Amount</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {expenses.map((expense) => (
              <Table.Tr key={expense.expenseId}>
                <Table.Td>{expense.vendor}</Table.Td>
                <Table.Td>{expense.paidBy}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {formatCents(expense.amount)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group justify="space-between">
          <Text fw={700} size="lg">
            Total: {formatCents(total)}
          </Text>
        </Group>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button color="green" onClick={onConfirm} loading={loading}>
            Confirm
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
