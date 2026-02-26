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
  Select,
  Button,
  Anchor,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconReceipt, IconPlus, IconFilterOff } from '@tabler/icons-react';
import { listExpenses, type ListExpensesFilters } from '../lib/api';
import { CATEGORY_FILTER_OPTIONS } from '../lib/categories';
import { formatCents, formatDate } from '../lib/format';
import type { Expense, AbleCategory } from '../lib/types';

export function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const fetchExpenses = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: ListExpensesFilters = {};
      if (categoryFilter) {
        filters.category = categoryFilter as AbleCategory;
      }
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
  }, [categoryFilter, startDate, endDate]);

  useEffect(() => {
    void fetchExpenses();
  }, [fetchExpenses]);

  const handleClearFilters = () => {
    setCategoryFilter('');
    setStartDate(null);
    setEndDate(null);
  };

  const handleRowClick = (expense: Expense) => {
    // Future: navigate to expense detail page
    // eslint-disable-next-line no-console
    console.log('Navigate to expense detail:', expense.expenseId);
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>Expenses</Title>
        <Button
          component={Link}
          to="/expenses/new"
          leftSection={<IconPlus size={16} />}
          size="sm"
        >
          Add Expense
        </Button>
      </Group>

      <Paper withBorder p="md" radius="md">
        <Group gap="md" align="end" wrap="wrap">
          <Select
            label="Category"
            placeholder="All categories"
            data={CATEGORY_FILTER_OPTIONS}
            value={categoryFilter}
            onChange={(value) => setCategoryFilter(value ?? '')}
            clearable
            w={250}
          />
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
            leftSection={<IconFilterOff size={16} />}
            onClick={handleClearFilters}
          >
            Clear filters
          </Button>
        </Group>
      </Paper>

      {isLoading && <ExpensesLoadingSkeleton />}

      {!isLoading && expenses.length === 0 && <ExpensesEmptyState />}

      {!isLoading && expenses.length > 0 && (
        <Paper withBorder radius="md" style={{ overflow: 'auto' }}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Vendor</Table.Th>
                <Table.Th>Category</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Amount</Table.Th>
                <Table.Th>Paid By</Table.Th>
                <Table.Th>Reimbursed</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {expenses.map((expense) => (
                <Table.Tr
                  key={expense.expenseId}
                  onClick={() => handleRowClick(expense)}
                  style={{ cursor: 'pointer' }}
                >
                  <Table.Td>{formatDate(expense.date)}</Table.Td>
                  <Table.Td>{expense.vendor}</Table.Td>
                  <Table.Td>{expense.category}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>
                    {formatCents(expense.amount)}
                  </Table.Td>
                  <Table.Td>{expense.paidBy}</Table.Td>
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
      )}
    </Stack>
  );
}

function ExpensesLoadingSkeleton() {
  return (
    <Paper withBorder p="md" radius="md" data-testid="expenses-loading">
      <Stack gap="sm">
        <Skeleton height={20} width="100%" />
        <Skeleton height={20} width="100%" />
        <Skeleton height={20} width="100%" />
        <Skeleton height={20} width="80%" />
        <Skeleton height={20} width="90%" />
      </Stack>
    </Paper>
  );
}

function ExpensesEmptyState() {
  return (
    <Paper withBorder p="xl" radius="md" ta="center">
      <IconReceipt size={48} stroke={1.5} color="gray" />
      <Text c="dimmed" mt="md">
        No expenses yet. Add your first expense to get started.
      </Text>
      <Anchor component={Link} to="/expenses/new" mt="sm" display="block">
        Add your first expense
      </Anchor>
    </Paper>
  );
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
