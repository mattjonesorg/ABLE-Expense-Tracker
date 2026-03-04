import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Title,
  Text,
  Stack,
  Paper,
  Table,
  Badge,
  Skeleton,
  Group,
  Card,
  SimpleGrid,
  Anchor,
  Button,
} from '@mantine/core';
import { IconCash, IconPlus, IconReceipt, IconCheck } from '@tabler/icons-react';
import { listExpenses } from '../lib/api';
import { formatCents, formatDate } from '../lib/format';
import type { Expense } from '../lib/types';

interface ReimbursementByPerson {
  paidBy: string;
  totalOwed: number;
  expenseCount: number;
}

function aggregateReimbursements(expenses: Expense[]): ReimbursementByPerson[] {
  const map = new Map<string, ReimbursementByPerson>();

  for (const expense of expenses) {
    if (expense.reimbursed) continue;

    const existing = map.get(expense.paidBy);
    if (existing) {
      existing.totalOwed += expense.amount;
      existing.expenseCount += 1;
    } else {
      map.set(expense.paidBy, {
        paidBy: expense.paidBy,
        totalOwed: expense.amount,
        expenseCount: 1,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalOwed - a.totalOwed);
}

export function Reimbursements() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchExpenses = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listExpenses();
      setExpenses(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchExpenses();
  }, [fetchExpenses]);

  const reimbursements = aggregateReimbursements(expenses);
  const totalUnreimbursed = reimbursements.reduce((sum, r) => sum + r.totalOwed, 0);
  const recentExpenses = [...expenses]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const allReimbursed = expenses.length > 0 && reimbursements.length === 0;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>Reimbursements</Title>
        <Button
          component={Link}
          to="/expenses/new"
          leftSection={<IconPlus size={16} />}
          size="sm"
        >
          Add Expense
        </Button>
      </Group>

      {isLoading && <ReimbursementsLoadingSkeleton />}

      {!isLoading && expenses.length === 0 && <ReimbursementsEmptyState />}

      {!isLoading && allReimbursed && <AllCaughtUpState />}

      {!isLoading && reimbursements.length > 0 && (
        <>
          <Paper withBorder p="lg" radius="md">
            <Group gap="sm" align="center">
              <IconCash size={24} stroke={1.5} />
              <div>
                <Text size="sm" c="dimmed">
                  Total Unreimbursed
                </Text>
                <Text size="xl" fw={700}>
                  {formatCents(totalUnreimbursed)}
                </Text>
              </div>
            </Group>
          </Paper>

          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {reimbursements.map((r) => (
              <Card key={r.paidBy} shadow="sm" padding="lg" radius="md" withBorder>
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={500} size="lg">
                      {r.paidBy}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {r.expenseCount === 1
                        ? '1 expense'
                        : `${r.expenseCount} expenses`}
                    </Text>
                  </div>
                  <Text fw={700} size="lg" c="red.6">
                    {formatCents(r.totalOwed)}
                  </Text>
                </Group>
              </Card>
            ))}
          </SimpleGrid>

          <Title order={3}>Recent Expenses</Title>
          <Paper withBorder radius="md" style={{ overflow: 'auto' }}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Vendor</Table.Th>
                  <Table.Th>Paid By</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Amount</Table.Th>
                  <Table.Th>Reimbursed</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {recentExpenses.map((expense) => (
                  <Table.Tr key={expense.expenseId}>
                    <Table.Td>{formatDate(expense.date)}</Table.Td>
                    <Table.Td>{expense.vendor}</Table.Td>
                    <Table.Td>{expense.paidBy}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      {formatCents(expense.amount)}
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={expense.reimbursed ? 'green' : 'gray'}
                        variant="light"
                      >
                        {expense.reimbursed ? 'Yes' : 'No'}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        </>
      )}
    </Stack>
  );
}

function ReimbursementsLoadingSkeleton() {
  return (
    <Paper withBorder p="md" radius="md" data-testid="reimbursements-loading">
      <Stack gap="sm">
        <Skeleton height={20} width="100%" />
        <Skeleton height={20} width="100%" />
        <Skeleton height={20} width="100%" />
        <Skeleton height={20} width="80%" />
      </Stack>
    </Paper>
  );
}

function ReimbursementsEmptyState() {
  return (
    <Paper withBorder p="xl" radius="md" ta="center">
      <IconReceipt size={48} stroke={1.5} color="gray" />
      <Text c="dimmed" mt="md">
        No expenses yet. Add your first expense to start tracking reimbursements.
      </Text>
      <Anchor component={Link} to="/expenses/new" mt="sm" display="block">
        Add your first expense
      </Anchor>
    </Paper>
  );
}

function AllCaughtUpState() {
  return (
    <Paper withBorder p="xl" radius="md" ta="center">
      <IconCheck size={48} stroke={1.5} color="teal" />
      <Text fw={500} mt="md">
        All caught up!
      </Text>
      <Text c="dimmed" size="sm">
        All expenses have been reimbursed.
      </Text>
    </Paper>
  );
}
