import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { Expenses } from '../../src/pages/Expenses';
import type { Expense } from '../../src/lib/types';

const MOCK_EXPENSES: Expense[] = [
  {
    expenseId: '01JBQE1A2B3C4D5E6F7G8H9J0K',
    accountId: 'acct_mock_001',
    date: '2026-02-15',
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
    createdAt: '2026-02-15T10:30:00Z',
    updatedAt: '2026-02-15T10:30:00Z',
  },
  {
    expenseId: '01JBQE2B3C4D5E6F7G8H9J0KL',
    accountId: 'acct_mock_001',
    date: '2026-02-10',
    vendor: 'Whole Foods Market',
    description: 'Weekly groceries',
    amount: 12350,
    category: 'Basic living expenses',
    categoryConfidence: 'ai_confirmed',
    categoryNotes: 'Groceries qualify.',
    receiptKey: 'receipts/mock-002.jpg',
    submittedBy: 'user_001',
    paidBy: 'Sarah',
    reimbursed: true,
    reimbursedAt: '2026-02-12T14:00:00Z',
    createdAt: '2026-02-10T08:15:00Z',
    updatedAt: '2026-02-12T14:00:00Z',
  },
  {
    expenseId: '01JBQE3C4D5E6F7G8H9J0KLM',
    accountId: 'acct_mock_001',
    date: '2026-01-28',
    vendor: 'Dr. Smith Family Practice',
    description: 'Annual checkup copay',
    amount: 4000,
    category: 'Health, prevention & wellness',
    categoryConfidence: 'ai_suggested',
    categoryNotes: 'Medical copay qualified.',
    receiptKey: 'receipts/mock-003.jpg',
    submittedBy: 'user_002',
    paidBy: 'Matt',
    reimbursed: false,
    reimbursedAt: null,
    createdAt: '2026-01-28T16:45:00Z',
    updatedAt: '2026-01-28T16:45:00Z',
  },
];

// Mock the API module
const mockListExpenses = vi.fn<[], Promise<Expense[]>>();
vi.mock('../../src/lib/api', () => ({
  listExpenses: (...args: unknown[]) => mockListExpenses(...(args as [])),
}));

function renderExpenses() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <Expenses />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('Expenses Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListExpenses.mockResolvedValue(MOCK_EXPENSES);
  });

  describe('heading and structure', () => {
    it('renders the Expenses heading', async () => {
      renderExpenses();
      expect(
        screen.getByRole('heading', { name: /expenses/i }),
      ).toBeInTheDocument();
    });

    it('has accessible heading structure', async () => {
      renderExpenses();
      const heading = screen.getByRole('heading', { name: /expenses/i });
      expect(heading.tagName).toMatch(/^H[1-6]$/);
    });
  });

  describe('loading state', () => {
    it('shows loading skeleton initially while fetching', () => {
      // Make the promise never resolve so we stay in loading state
      mockListExpenses.mockReturnValue(new Promise(() => {}));
      renderExpenses();
      expect(screen.getByTestId('expenses-loading')).toBeInTheDocument();
    });
  });

  describe('expense table', () => {
    it('renders expense table with mock data after loading', async () => {
      renderExpenses();
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });
    });

    it('displays all expense vendor names', async () => {
      renderExpenses();
      await waitFor(() => {
        expect(screen.getByText('City Transit Authority')).toBeInTheDocument();
      });
      expect(screen.getByText('Whole Foods Market')).toBeInTheDocument();
      expect(screen.getByText('Dr. Smith Family Practice')).toBeInTheDocument();
    });

    it('displays formatted amounts converting cents to dollars', async () => {
      renderExpenses();
      await waitFor(() => {
        expect(screen.getByText('$75.00')).toBeInTheDocument();
      });
      expect(screen.getByText('$123.50')).toBeInTheDocument();
      expect(screen.getByText('$40.00')).toBeInTheDocument();
    });

    it('displays formatted dates', async () => {
      renderExpenses();
      await waitFor(() => {
        expect(screen.getByText('Feb 15, 2026')).toBeInTheDocument();
      });
      expect(screen.getByText('Feb 10, 2026')).toBeInTheDocument();
      expect(screen.getByText('Jan 28, 2026')).toBeInTheDocument();
    });

    it('shows category labels in table rows', async () => {
      renderExpenses();
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row');
      // Row 0 is header; rows 1-3 are data rows
      expect(within(rows[1]).getByText('Transportation')).toBeInTheDocument();
      expect(
        within(rows[2]).getByText('Basic living expenses'),
      ).toBeInTheDocument();
      expect(
        within(rows[3]).getByText('Health, prevention & wellness'),
      ).toBeInTheDocument();
    });

    it('shows reimbursement status badges', async () => {
      renderExpenses();
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      const rows = screen.getAllByRole('row');
      // Row 0 is header, rows 1-3 are data rows

      // First expense: not reimbursed
      const row1 = rows[1];
      expect(within(row1).getByText('No')).toBeInTheDocument();

      // Second expense: reimbursed
      const row2 = rows[2];
      expect(within(row2).getByText('Yes')).toBeInTheDocument();

      // Third expense: not reimbursed
      const row3 = rows[3];
      expect(within(row3).getByText('No')).toBeInTheDocument();
    });

    it('displays paid-by names', async () => {
      renderExpenses();
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      const rows = screen.getAllByRole('row');
      expect(within(rows[1]).getByText('Matt')).toBeInTheDocument();
      expect(within(rows[2]).getByText('Sarah')).toBeInTheDocument();
    });

    it('has proper table column headers', async () => {
      renderExpenses();
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      expect(
        screen.getByRole('columnheader', { name: /date/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('columnheader', { name: /vendor/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('columnheader', { name: /category/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('columnheader', { name: /amount/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('columnheader', { name: /paid by/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('columnheader', { name: /reimbursed/i }),
      ).toBeInTheDocument();
    });
  });

  describe('category filter', () => {
    it('renders a category filter dropdown', async () => {
      renderExpenses();
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      // The category select renders a searchable input with role "searchbox"
      // within a labeled wrapper. Use getByRole to find the textbox labeled "Category".
      const categoryInput = screen.getByRole('textbox', { name: /category/i });
      expect(categoryInput).toBeInTheDocument();
    });

    it('filters expenses by category when a category is selected', async () => {
      // First call returns all, second call (after filter) returns filtered
      mockListExpenses
        .mockResolvedValueOnce(MOCK_EXPENSES)
        .mockResolvedValueOnce([MOCK_EXPENSES[0]]);

      const user = userEvent.setup();
      renderExpenses();

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      // Open the category select and pick Transportation
      const categoryInput = screen.getByRole('textbox', { name: /category/i });
      await user.click(categoryInput);

      const option = await screen.findByRole('option', {
        name: /transportation/i,
      });
      await user.click(option);

      await waitFor(() => {
        expect(mockListExpenses).toHaveBeenCalledWith(
          expect.objectContaining({ category: 'Transportation' }),
        );
      });
    });
  });

  describe('clear filters', () => {
    it('renders a clear filters button', async () => {
      renderExpenses();
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      expect(
        screen.getByRole('button', { name: /clear filters/i }),
      ).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state message when no expenses exist', async () => {
      mockListExpenses.mockResolvedValue([]);
      renderExpenses();

      await waitFor(() => {
        expect(
          screen.getByText(/no expenses yet/i),
        ).toBeInTheDocument();
      });
    });

    it('shows an "Add Expense" link in empty state', async () => {
      mockListExpenses.mockResolvedValue([]);
      renderExpenses();

      await waitFor(() => {
        expect(screen.getByText(/no expenses yet/i)).toBeInTheDocument();
      });

      // Find the link specifically in the empty state area (not the header button)
      const addLink = screen.getByRole('link', {
        name: /add your first expense/i,
      });
      expect(addLink).toHaveAttribute('href', '/expenses/new');
    });

    it('does not show table in empty state', async () => {
      mockListExpenses.mockResolvedValue([]);
      renderExpenses();

      await waitFor(() => {
        expect(screen.getByText(/no expenses yet/i)).toBeInTheDocument();
      });

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });
});
