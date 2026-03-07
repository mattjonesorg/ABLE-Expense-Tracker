import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { Reports } from '../../src/pages/Reports';
import type { Expense } from '../../src/lib/types';

const MOCK_EXPENSES: Expense[] = [
  {
    expenseId: '01RPT_MATT_1',
    accountId: 'acct_mock_001',
    date: '2026-02-20',
    vendor: 'City Transit Authority',
    description: 'Monthly bus pass',
    amount: 7500,
    category: 'Transportation',
    categoryConfidence: 'ai_confirmed',
    categoryNotes: 'Public transit pass qualified.',
    receiptKey: null,
    submittedBy: 'user_001',
    paidBy: 'Matt',
    reimbursed: false,
    reimbursedAt: null,
    createdAt: '2026-02-20T10:30:00Z',
    updatedAt: '2026-02-20T10:30:00Z',
  },
  {
    expenseId: '01RPT_MATT_2',
    accountId: 'acct_mock_001',
    date: '2026-02-18',
    vendor: 'Dr. Smith Family Practice',
    description: 'Annual checkup copay',
    amount: 4000,
    category: 'Health, prevention & wellness',
    categoryConfidence: 'ai_suggested',
    categoryNotes: 'Medical copay qualified.',
    receiptKey: null,
    submittedBy: 'user_001',
    paidBy: 'Matt',
    reimbursed: false,
    reimbursedAt: null,
    createdAt: '2026-02-18T16:45:00Z',
    updatedAt: '2026-02-18T16:45:00Z',
  },
  {
    expenseId: '01RPT_SARAH_1',
    accountId: 'acct_mock_001',
    date: '2026-02-15',
    vendor: 'Whole Foods Market',
    description: 'Weekly groceries',
    amount: 12350,
    category: 'Basic living expenses',
    categoryConfidence: 'ai_confirmed',
    categoryNotes: 'Groceries qualify.',
    receiptKey: 'receipts/mock-002.jpg',
    submittedBy: 'user_002',
    paidBy: 'Sarah',
    reimbursed: false,
    reimbursedAt: null,
    createdAt: '2026-02-15T08:15:00Z',
    updatedAt: '2026-02-15T08:15:00Z',
  },
  {
    expenseId: '01RPT_MATT_3',
    accountId: 'acct_mock_001',
    date: '2026-02-10',
    vendor: 'Amazon',
    description: 'Adaptive keyboard',
    amount: 8999,
    category: 'Assistive technology & personal support',
    categoryConfidence: 'ai_confirmed',
    categoryNotes: 'Assistive tech qualified.',
    receiptKey: null,
    submittedBy: 'user_001',
    paidBy: 'Matt',
    reimbursed: true,
    reimbursedAt: '2026-02-12T14:00:00Z',
    createdAt: '2026-02-10T12:00:00Z',
    updatedAt: '2026-02-12T14:00:00Z',
  },
  {
    expenseId: '01RPT_SARAH_2',
    accountId: 'acct_mock_001',
    date: '2026-02-05',
    vendor: 'Target',
    description: 'Household supplies',
    amount: 3500,
    category: 'Basic living expenses',
    categoryConfidence: 'user_selected',
    categoryNotes: '',
    receiptKey: null,
    submittedBy: 'user_002',
    paidBy: 'Sarah',
    reimbursed: true,
    reimbursedAt: '2026-02-07T10:00:00Z',
    createdAt: '2026-02-05T09:00:00Z',
    updatedAt: '2026-02-07T10:00:00Z',
  },
];

// Mock the API module
const mockListExpenses = vi.fn<[], Promise<Expense[]>>();
vi.mock('../../src/lib/api', () => ({
  listExpenses: (...args: unknown[]) => mockListExpenses(...(args as [])),
}));

function renderReports() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('Reports Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListExpenses.mockResolvedValue(MOCK_EXPENSES);
  });

  describe('heading and structure', () => {
    it('renders the Reports heading', async () => {
      renderReports();
      expect(
        screen.getByRole('heading', { name: /reports/i }),
      ).toBeInTheDocument();
    });

    it('has accessible heading structure', async () => {
      renderReports();
      const heading = screen.getByRole('heading', { name: /reports/i });
      expect(heading.tagName).toMatch(/^H[1-6]$/);
    });
  });

  describe('loading state', () => {
    it('shows loading skeleton initially while fetching', () => {
      mockListExpenses.mockReturnValue(new Promise(() => {}));
      renderReports();
      expect(screen.getByTestId('reports-loading')).toBeInTheDocument();
    });
  });

  describe('summary cards', () => {
    it('displays total expenses count', async () => {
      renderReports();
      // 5 total expenses
      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument();
      });
      expect(screen.getByText(/total expenses/i)).toBeInTheDocument();
    });

    it('displays total amount across all expenses', async () => {
      renderReports();
      // Total: 7500 + 4000 + 12350 + 8999 + 3500 = 36349 cents = $363.49
      await waitFor(() => {
        expect(screen.getByText('$363.49')).toBeInTheDocument();
      });
      // "Total Amount" appears in both summary card and person table header;
      // verify at least one is present
      expect(screen.getAllByText(/total amount/i).length).toBeGreaterThanOrEqual(1);
    });

    it('displays total reimbursed amount', async () => {
      renderReports();
      // Reimbursed: 8999 + 3500 = 12499 cents = $124.99
      await waitFor(() => {
        expect(screen.getByText('$124.99')).toBeInTheDocument();
      });
      expect(screen.getByText(/total reimbursed/i)).toBeInTheDocument();
    });

    it('displays total unreimbursed amount', async () => {
      renderReports();
      // Unreimbursed: 7500 + 4000 + 12350 = 23850 cents = $238.50
      await waitFor(() => {
        expect(screen.getByText('$238.50')).toBeInTheDocument();
      });
      expect(screen.getByText(/total unreimbursed/i)).toBeInTheDocument();
    });
  });

  describe('category breakdown table', () => {
    it('renders a category breakdown section heading', async () => {
      renderReports();
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /by category/i }),
        ).toBeInTheDocument();
      });
    });

    it('renders a table with category name, count, and total columns', async () => {
      renderReports();
      await waitFor(() => {
        expect(screen.getByTestId('category-table')).toBeInTheDocument();
      });

      const table = screen.getByTestId('category-table');
      expect(
        within(table).getByRole('columnheader', { name: /category/i }),
      ).toBeInTheDocument();
      expect(
        within(table).getByRole('columnheader', { name: /count/i }),
      ).toBeInTheDocument();
      expect(
        within(table).getByRole('columnheader', { name: /total/i }),
      ).toBeInTheDocument();
    });

    it('shows each category with its expense count and total amount', async () => {
      renderReports();
      await waitFor(() => {
        expect(screen.getByTestId('category-table')).toBeInTheDocument();
      });

      const table = screen.getByTestId('category-table');
      const rows = within(table).getAllByRole('row');
      // Header + 4 category rows (Transportation, Health, Basic living, Assistive tech)
      // At minimum there should be category rows for the 4 unique categories in our data
      expect(rows.length).toBeGreaterThanOrEqual(5); // 1 header + 4 data rows

      // Check that categories from test data appear
      expect(within(table).getByText('Transportation')).toBeInTheDocument();
      expect(
        within(table).getByText('Health, prevention & wellness'),
      ).toBeInTheDocument();
      expect(
        within(table).getByText('Basic living expenses'),
      ).toBeInTheDocument();
      expect(
        within(table).getByText('Assistive technology & personal support'),
      ).toBeInTheDocument();
    });

    it('aggregates counts correctly per category', async () => {
      renderReports();
      await waitFor(() => {
        expect(screen.getByTestId('category-table')).toBeInTheDocument();
      });

      const table = screen.getByTestId('category-table');
      const rows = within(table).getAllByRole('row');

      // Basic living expenses has 2 expenses (Whole Foods + Target)
      // Find the row with "Basic living expenses"
      const basicRow = rows.find((row) =>
        within(row).queryByText('Basic living expenses'),
      );
      expect(basicRow).toBeDefined();
      // 2 expenses, total = 12350 + 3500 = 15850 = $158.50
      expect(within(basicRow!).getByText('2')).toBeInTheDocument();
      expect(within(basicRow!).getByText('$158.50')).toBeInTheDocument();
    });
  });

  describe('date range filter', () => {
    it('renders from and to date input fields', async () => {
      renderReports();
      await waitFor(() => {
        expect(screen.getByTestId('category-table')).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/from date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/to date/i)).toBeInTheDocument();
    });

    it('passes date filters to listExpenses when dates are set', async () => {
      const user = userEvent.setup();
      renderReports();

      await waitFor(() => {
        expect(screen.getByTestId('category-table')).toBeInTheDocument();
      });

      // Type a date in the "From date" input
      const fromInput = screen.getByLabelText(/from date/i);
      await user.click(fromInput);
      await user.type(fromInput, '02/01/2026');

      await waitFor(() => {
        expect(mockListExpenses).toHaveBeenCalledWith(
          expect.objectContaining({ startDate: '2026-02-01' }),
        );
      });
    });

    it('renders a clear filters button', async () => {
      renderReports();
      await waitFor(() => {
        expect(screen.getByTestId('category-table')).toBeInTheDocument();
      });

      expect(
        screen.getByRole('button', { name: /clear filters/i }),
      ).toBeInTheDocument();
    });
  });

  describe('person breakdown table', () => {
    it('renders a "By Person" section heading', async () => {
      renderReports();
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /by person/i }),
        ).toBeInTheDocument();
      });
    });

    it('renders a table with person, count, total amount, reimbursed, and unreimbursed columns', async () => {
      renderReports();
      await waitFor(() => {
        expect(screen.getByTestId('person-table')).toBeInTheDocument();
      });

      const table = screen.getByTestId('person-table');
      expect(
        within(table).getByRole('columnheader', { name: /person/i }),
      ).toBeInTheDocument();
      expect(
        within(table).getByRole('columnheader', { name: /count/i }),
      ).toBeInTheDocument();
      expect(
        within(table).getByRole('columnheader', { name: /total amount/i }),
      ).toBeInTheDocument();
      expect(
        within(table).getByRole('columnheader', { name: /^reimbursed$/i }),
      ).toBeInTheDocument();
      expect(
        within(table).getByRole('columnheader', { name: /^unreimbursed$/i }),
      ).toBeInTheDocument();
    });

    it('shows each person with their expense aggregates', async () => {
      renderReports();
      await waitFor(() => {
        expect(screen.getByTestId('person-table')).toBeInTheDocument();
      });

      const table = screen.getByTestId('person-table');
      // Matt and Sarah should both appear
      expect(within(table).getByText('Matt')).toBeInTheDocument();
      expect(within(table).getByText('Sarah')).toBeInTheDocument();
    });

    it('aggregates per-person data correctly for Matt', async () => {
      renderReports();
      await waitFor(() => {
        expect(screen.getByTestId('person-table')).toBeInTheDocument();
      });

      const table = screen.getByTestId('person-table');
      const rows = within(table).getAllByRole('row');
      const mattRow = rows.find((row) => within(row).queryByText('Matt'));
      expect(mattRow).toBeDefined();

      // Matt: 3 expenses, total = 7500 + 4000 + 8999 = 20499 = $204.99
      // Reimbursed = 8999 = $89.99, Unreimbursed = 7500 + 4000 = 11500 = $115.00
      expect(within(mattRow!).getByText('3')).toBeInTheDocument();
      expect(within(mattRow!).getByText('$204.99')).toBeInTheDocument();
      expect(within(mattRow!).getByText('$89.99')).toBeInTheDocument();
      expect(within(mattRow!).getByText('$115.00')).toBeInTheDocument();
    });

    it('aggregates per-person data correctly for Sarah', async () => {
      renderReports();
      await waitFor(() => {
        expect(screen.getByTestId('person-table')).toBeInTheDocument();
      });

      const table = screen.getByTestId('person-table');
      const rows = within(table).getAllByRole('row');
      const sarahRow = rows.find((row) => within(row).queryByText('Sarah'));
      expect(sarahRow).toBeDefined();

      // Sarah: 2 expenses, total = 12350 + 3500 = 15850 = $158.50
      // Reimbursed = 3500 = $35.00, Unreimbursed = 12350 = $123.50
      expect(within(sarahRow!).getByText('2')).toBeInTheDocument();
      expect(within(sarahRow!).getByText('$158.50')).toBeInTheDocument();
      expect(within(sarahRow!).getByText('$35.00')).toBeInTheDocument();
      expect(within(sarahRow!).getByText('$123.50')).toBeInTheDocument();
    });

    it('sorts persons by total amount descending', async () => {
      renderReports();
      await waitFor(() => {
        expect(screen.getByTestId('person-table')).toBeInTheDocument();
      });

      const table = screen.getByTestId('person-table');
      const rows = within(table).getAllByRole('row');
      // rows[0] is the header row, rows[1] should be Matt ($204.99), rows[2] should be Sarah ($158.50)
      expect(rows.length).toBe(3); // 1 header + 2 data rows
      expect(within(rows[1]).getByText('Matt')).toBeInTheDocument();
      expect(within(rows[2]).getByText('Sarah')).toBeInTheDocument();
    });

    it('does not show the person table in empty state', async () => {
      mockListExpenses.mockResolvedValue([]);
      renderReports();

      await waitFor(() => {
        expect(screen.getByText(/no expenses yet/i)).toBeInTheDocument();
      });

      expect(screen.queryByTestId('person-table')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: /by person/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('date range presets', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('renders preset buttons for common date ranges', async () => {
      renderReports();
      await waitFor(() => {
        expect(screen.getByTestId('category-table')).toBeInTheDocument();
      });

      expect(
        screen.getByRole('button', { name: /this month/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /last month/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /this year/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /last year/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /all time/i }),
      ).toBeInTheDocument();
    });

    it('sets "This Month" date range when clicked', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date(2026, 2, 15)); // March 15, 2026

      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });
      renderReports();

      await waitFor(() => {
        expect(screen.getByTestId('category-table')).toBeInTheDocument();
      });

      mockListExpenses.mockClear();
      await user.click(screen.getByRole('button', { name: /this month/i }));

      await waitFor(() => {
        expect(mockListExpenses).toHaveBeenCalledWith(
          expect.objectContaining({
            startDate: '2026-03-01',
          }),
        );
      });
    });

    it('sets "Last Month" date range when clicked', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date(2026, 2, 15)); // March 15, 2026

      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });
      renderReports();

      await waitFor(() => {
        expect(screen.getByTestId('category-table')).toBeInTheDocument();
      });

      mockListExpenses.mockClear();
      await user.click(screen.getByRole('button', { name: /last month/i }));

      await waitFor(() => {
        expect(mockListExpenses).toHaveBeenCalledWith(
          expect.objectContaining({
            startDate: '2026-02-01',
            endDate: '2026-02-28',
          }),
        );
      });
    });

    it('sets "This Year" date range when clicked', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date(2026, 2, 15)); // March 15, 2026

      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });
      renderReports();

      await waitFor(() => {
        expect(screen.getByTestId('category-table')).toBeInTheDocument();
      });

      mockListExpenses.mockClear();
      await user.click(screen.getByRole('button', { name: /this year/i }));

      await waitFor(() => {
        expect(mockListExpenses).toHaveBeenCalledWith(
          expect.objectContaining({
            startDate: '2026-01-01',
          }),
        );
      });
    });

    it('sets "Last Year" date range when clicked', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date(2026, 2, 15)); // March 15, 2026

      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });
      renderReports();

      await waitFor(() => {
        expect(screen.getByTestId('category-table')).toBeInTheDocument();
      });

      mockListExpenses.mockClear();
      await user.click(screen.getByRole('button', { name: /last year/i }));

      await waitFor(() => {
        expect(mockListExpenses).toHaveBeenCalledWith(
          expect.objectContaining({
            startDate: '2025-01-01',
            endDate: '2025-12-31',
          }),
        );
      });
    });

    it('clears date range when "All Time" is clicked', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date(2026, 2, 15)); // March 15, 2026

      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });
      renderReports();

      await waitFor(() => {
        expect(screen.getByTestId('category-table')).toBeInTheDocument();
      });

      // First set a date range
      await user.click(screen.getByRole('button', { name: /this month/i }));
      await waitFor(() => {
        expect(mockListExpenses).toHaveBeenCalledWith(
          expect.objectContaining({ startDate: '2026-03-01' }),
        );
      });

      mockListExpenses.mockClear();
      // Then click All Time to clear
      await user.click(screen.getByRole('button', { name: /all time/i }));

      await waitFor(() => {
        expect(mockListExpenses).toHaveBeenCalledWith({});
      });
    });
  });

  describe('empty state', () => {
    it('shows empty state message when no expenses exist', async () => {
      mockListExpenses.mockResolvedValue([]);
      renderReports();

      await waitFor(() => {
        expect(screen.getByText(/no expenses yet/i)).toBeInTheDocument();
      });
    });

    it('does not show summary cards or category table in empty state', async () => {
      mockListExpenses.mockResolvedValue([]);
      renderReports();

      await waitFor(() => {
        expect(screen.getByText(/no expenses yet/i)).toBeInTheDocument();
      });

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByText(/total expenses/i)).not.toBeInTheDocument();
    });
  });
});
