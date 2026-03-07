import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Title,
  Text,
  Stack,
  Paper,
  Table,
  Skeleton,
  Group,
  Card,
  SimpleGrid,
  Anchor,
  Button,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  IconReceipt,
  IconCash,
  IconChartBar,
  IconFilterOff,
  IconCheck,
  IconCalendar,
} from '@tabler/icons-react';
import { listExpenses, type ListExpensesFilters } from '../lib/api';
import { formatCents } from '../lib/format';
import type { Expense, AbleCategory } from '../lib/types';

interface CategoryBreakdown {
  category: AbleCategory;
  expenseCount: number;
  totalAmount: number;
}

interface PersonBreakdown {
  person: string;
  expenseCount: number;
  totalAmount: number;
  totalReimbursed: number;
  totalUnreimbursed: number;
}

interface ReportSummary {
  totalCount: number;
  totalAmount: number;
  totalReimbursed: number;
  totalUnreimbursed: number;
  categories: CategoryBreakdown[];
  persons: PersonBreakdown[];
}

function aggregateReport(expenses: Expense[]): ReportSummary {
  let totalAmount = 0;
  let totalReimbursed = 0;
  let totalUnreimbursed = 0;
  const categoryMap = new Map<AbleCategory, CategoryBreakdown>();
  const personMap = new Map<string, PersonBreakdown>();

  for (const expense of expenses) {
    totalAmount += expense.amount;

    if (expense.reimbursed) {
      totalReimbursed += expense.amount;
    } else {
      totalUnreimbursed += expense.amount;
    }

    // Category aggregation
    const existingCat = categoryMap.get(expense.category);
    if (existingCat) {
      existingCat.expenseCount += 1;
      existingCat.totalAmount += expense.amount;
    } else {
      categoryMap.set(expense.category, {
        category: expense.category,
        expenseCount: 1,
        totalAmount: expense.amount,
      });
    }

    // Person aggregation
    const existingPerson = personMap.get(expense.paidBy);
    if (existingPerson) {
      existingPerson.expenseCount += 1;
      existingPerson.totalAmount += expense.amount;
      if (expense.reimbursed) {
        existingPerson.totalReimbursed += expense.amount;
      } else {
        existingPerson.totalUnreimbursed += expense.amount;
      }
    } else {
      personMap.set(expense.paidBy, {
        person: expense.paidBy,
        expenseCount: 1,
        totalAmount: expense.amount,
        totalReimbursed: expense.reimbursed ? expense.amount : 0,
        totalUnreimbursed: expense.reimbursed ? 0 : expense.amount,
      });
    }
  }

  const categories = Array.from(categoryMap.values()).sort(
    (a, b) => b.totalAmount - a.totalAmount,
  );

  const persons = Array.from(personMap.values()).sort(
    (a, b) => b.totalAmount - a.totalAmount,
  );

  return {
    totalCount: expenses.length,
    totalAmount,
    totalReimbursed,
    totalUnreimbursed,
    categories,
    persons,
  };
}

/**
 * Format a Date object to YYYY-MM-DD string for API filters.
 */
function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function Reports() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const fetchExpenses = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: ListExpensesFilters = {};
      if (startDate) {
        filters.startDate = formatISODate(startDate);
      }
      if (endDate) {
        filters.endDate = formatISODate(endDate);
      }
      const data = await listExpenses(filters);
      setExpenses(data);
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void fetchExpenses();
  }, [fetchExpenses]);

  const handleClearFilters = () => {
    setStartDate(null);
    setEndDate(null);
  };

  const handlePresetThisMonth = () => {
    const now = new Date();
    setStartDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setEndDate(null);
  };

  const handlePresetLastMonth = () => {
    const now = new Date();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    // Last day of last month = day 0 of current month
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    setStartDate(lastMonthStart);
    setEndDate(lastMonthEnd);
  };

  const handlePresetThisYear = () => {
    const now = new Date();
    setStartDate(new Date(now.getFullYear(), 0, 1));
    setEndDate(null);
  };

  const handlePresetLastYear = () => {
    const now = new Date();
    setStartDate(new Date(now.getFullYear() - 1, 0, 1));
    setEndDate(new Date(now.getFullYear() - 1, 11, 31));
  };

  const handlePresetAllTime = () => {
    setStartDate(null);
    setEndDate(null);
  };

  const summary = aggregateReport(expenses);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={1}>Reports</Title>
      </Group>

      {/* Date range filter */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group gap="md" align="end" wrap="wrap">
            <DateInput
              label="From date"
              placeholder="Start date"
              value={startDate}
              onChange={setStartDate}
              clearable
              w={180}
            />
            <DateInput
              label="To date"
              placeholder="End date"
              value={endDate}
              onChange={setEndDate}
              clearable
              w={180}
            />
            <Button
              variant="subtle"
              leftSection={<IconFilterOff size={16} aria-hidden="true" />}
              onClick={handleClearFilters}
            >
              Clear filters
            </Button>
          </Group>
          <Group gap="xs" wrap="wrap">
            <IconCalendar size={16} stroke={1.5} aria-hidden="true" />
            <Button variant="light" size="xs" onClick={handlePresetThisMonth}>
              This Month
            </Button>
            <Button variant="light" size="xs" onClick={handlePresetLastMonth}>
              Last Month
            </Button>
            <Button variant="light" size="xs" onClick={handlePresetThisYear}>
              This Year
            </Button>
            <Button variant="light" size="xs" onClick={handlePresetLastYear}>
              Last Year
            </Button>
            <Button variant="light" size="xs" onClick={handlePresetAllTime}>
              All Time
            </Button>
          </Group>
        </Stack>
      </Paper>

      {isLoading && <ReportsLoadingSkeleton />}

      {!isLoading && expenses.length === 0 && <ReportsEmptyState />}

      {!isLoading && expenses.length > 0 && (
        <>
          {/* Summary cards */}
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Group gap="sm" align="center">
                <IconReceipt size={24} stroke={1.5} aria-hidden="true" />
                <div>
                  <Text size="sm" c="dimmed">
                    Total Expenses
                  </Text>
                  <Text size="xl" fw={700}>
                    {summary.totalCount}
                  </Text>
                </div>
              </Group>
            </Card>

            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Group gap="sm" align="center">
                <IconChartBar size={24} stroke={1.5} aria-hidden="true" />
                <div>
                  <Text size="sm" c="dimmed">
                    Total Amount
                  </Text>
                  <Text size="xl" fw={700}>
                    {formatCents(summary.totalAmount)}
                  </Text>
                </div>
              </Group>
            </Card>

            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Group gap="sm" align="center">
                <IconCheck size={24} stroke={1.5} aria-hidden="true" />
                <div>
                  <Text size="sm" c="dimmed">
                    Total Reimbursed
                  </Text>
                  <Text size="xl" fw={700}>
                    {formatCents(summary.totalReimbursed)}
                  </Text>
                </div>
              </Group>
            </Card>

            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Group gap="sm" align="center">
                <IconCash size={24} stroke={1.5} aria-hidden="true" />
                <div>
                  <Text size="sm" c="dimmed">
                    Total Unreimbursed
                  </Text>
                  <Text size="xl" fw={700}>
                    {formatCents(summary.totalUnreimbursed)}
                  </Text>
                </div>
              </Group>
            </Card>
          </SimpleGrid>

          {/* Category breakdown */}
          <Title order={2}>By Category</Title>
          <Paper withBorder radius="md" style={{ overflow: 'auto' }} data-testid="category-table">
            <Table striped highlightOnHover aria-label="Expenses by category">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Category</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Count</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Total</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {summary.categories.map((cat) => (
                  <Table.Tr key={cat.category}>
                    <Table.Td>{cat.category}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      {cat.expenseCount}
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      {formatCents(cat.totalAmount)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>

          {/* Person breakdown */}
          <Title order={2}>By Person</Title>
          <Paper withBorder radius="md" style={{ overflow: 'auto' }} data-testid="person-table">
            <Table striped highlightOnHover aria-label="Expenses by person">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Person</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Count</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Total Amount</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Reimbursed</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Unreimbursed</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {summary.persons.map((p) => (
                  <Table.Tr key={p.person}>
                    <Table.Td>{p.person}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      {p.expenseCount}
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      {formatCents(p.totalAmount)}
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      {formatCents(p.totalReimbursed)}
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      {formatCents(p.totalUnreimbursed)}
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

function ReportsLoadingSkeleton() {
  return (
    <Paper withBorder p="md" radius="md" data-testid="reports-loading" role="status" aria-label="Loading reports">
      <Stack gap="sm">
        <Skeleton height={20} width="100%" />
        <Skeleton height={20} width="100%" />
        <Skeleton height={20} width="100%" />
        <Skeleton height={20} width="80%" />
      </Stack>
    </Paper>
  );
}

function ReportsEmptyState() {
  return (
    <Paper withBorder p="xl" radius="md" ta="center">
      <IconReceipt size={48} stroke={1.5} color="gray" aria-hidden="true" />
      <Text c="dimmed" mt="md">
        No expenses yet. Add your first expense to start viewing reports.
      </Text>
      <Anchor component={Link} to="/expenses/new" mt="sm" display="block">
        Add your first expense
      </Anchor>
    </Paper>
  );
}
