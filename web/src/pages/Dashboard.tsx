import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Title,
  Text,
  Card,
  SimpleGrid,
  Group,
  Stack,
  ThemeIcon,
  Paper,
  Skeleton,
  Anchor,
} from '@mantine/core';
import {
  IconPlus,
  IconReceipt,
  IconCash,
  IconWallet,
} from '@tabler/icons-react';
import { useAuth } from '../lib/auth';
import { getReimbursementSummaries, listExpenses } from '../lib/api';
import { formatCents, formatDate } from '../lib/format';
import type { ReimbursementSummary, Expense } from '../lib/types';

interface QuickAction {
  title: string;
  description: string;
  href: string;
  icon: typeof IconPlus;
  color: string;
}

const quickActions: QuickAction[] = [
  {
    title: 'Add Expense',
    description: 'Record a new qualified ABLE expense',
    href: '/expenses/new',
    icon: IconPlus,
    color: 'blue',
  },
  {
    title: 'View Expenses',
    description: 'Browse and manage your expenses',
    href: '/expenses',
    icon: IconReceipt,
    color: 'teal',
  },
];

export function Dashboard() {
  const { user } = useAuth();
  const [summaries, setSummaries] = useState<ReimbursementSummary[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [summaryData, expenseData] = await Promise.all([
        getReimbursementSummaries(),
        listExpenses(),
      ]);
      setSummaries(summaryData);
      setRecentExpenses(expenseData.slice(0, 5));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load dashboard data';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const totalOwed = summaries.reduce((sum, s) => sum + s.totalOwed, 0);
  const hasData = summaries.length > 0 || recentExpenses.length > 0;

  return (
    <Stack gap="lg">
      <div>
        <Title order={1}>Dashboard</Title>
        <Text c="dimmed" mt="xs">
          Welcome, {user?.displayName}
        </Text>
      </div>

      <Title order={2}>Quick Actions</Title>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {quickActions.map((action) => (
          <Card
            key={action.href}
            component={Link}
            to={action.href}
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <Group>
              <ThemeIcon size="lg" radius="md" variant="light" color={action.color}>
                <action.icon size={20} stroke={1.5} aria-hidden="true" />
              </ThemeIcon>
              <div>
                <Text fw={500}>{action.title}</Text>
                <Text size="sm" c="dimmed">
                  {action.description}
                </Text>
              </div>
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      {isLoading && <DashboardLoadingSkeleton />}

      {!isLoading && error && (
        <Paper withBorder p="xl" radius="md" ta="center" role="alert">
          <Text c="red">Failed to load dashboard data</Text>
        </Paper>
      )}

      {!isLoading && !error && !hasData && <DashboardEmptyState />}

      {!isLoading && !error && hasData && (
        <>
          <Title order={2}>Reimbursements</Title>
          <Paper withBorder p="md" radius="md">
            <Group gap="xs" mb="md">
              <ThemeIcon size="lg" radius="md" variant="light" color="green">
                <IconWallet size={20} stroke={1.5} aria-hidden="true" />
              </ThemeIcon>
              <div>
                <Text size="sm" c="dimmed">Total Unreimbursed</Text>
                <Text size="xl" fw={700}>{formatCents(totalOwed)}</Text>
              </div>
            </Group>

            {summaries.length > 0 && (
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                {summaries.map((summary) => (
                  <Card key={summary.userId} withBorder padding="sm" radius="md">
                    <Group>
                      <ThemeIcon size="md" radius="md" variant="light" color="orange">
                        <IconCash size={16} stroke={1.5} aria-hidden="true" />
                      </ThemeIcon>
                      <div>
                        <Text fw={500}>{summary.displayName}</Text>
                        <Text size="sm" c="dimmed">
                          {formatCents(summary.totalOwed)} &middot; {summary.expenseCount} expenses
                        </Text>
                      </div>
                    </Group>
                  </Card>
                ))}
              </SimpleGrid>
            )}
          </Paper>

          {recentExpenses.length > 0 && (
            <>
              <Title order={2}>Recent Expenses</Title>
              <Paper withBorder radius="md" p="md">
                <Stack gap="xs">
                  {recentExpenses.map((expense) => (
                    <Group key={expense.expenseId} justify="space-between">
                      <div>
                        <Text size="sm" fw={500}>{expense.vendor}</Text>
                        <Text size="xs" c="dimmed">{formatDate(expense.date)}</Text>
                      </div>
                      <Text size="sm" fw={500}>{formatCents(expense.amount)}</Text>
                    </Group>
                  ))}
                </Stack>
              </Paper>
            </>
          )}
        </>
      )}
    </Stack>
  );
}

function DashboardLoadingSkeleton() {
  return (
    <Paper withBorder p="md" radius="md" data-testid="dashboard-loading" role="status" aria-label="Loading dashboard data">
      <Stack gap="sm">
        <Skeleton height={20} width="60%" />
        <Skeleton height={40} width="40%" />
        <Skeleton height={20} width="100%" />
        <Skeleton height={20} width="100%" />
        <Skeleton height={20} width="80%" />
      </Stack>
    </Paper>
  );
}

function DashboardEmptyState() {
  return (
    <Paper withBorder p="xl" radius="md" ta="center">
      <IconReceipt size={48} stroke={1.5} color="gray" aria-hidden="true" />
      <Text c="dimmed" mt="md">
        No expenses yet. Get started by recording your first one.
      </Text>
      <Anchor component={Link} to="/expenses/new" mt="sm" display="block">
        Add your first expense
      </Anchor>
    </Paper>
  );
}
