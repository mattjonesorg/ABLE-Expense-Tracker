import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { Reimbursements } from '../../src/pages/Reimbursements';
import type { Expense } from '../../src/lib/types';

const MOCK_EXPENSES: Expense[] = [
  {
    expenseId: '01REIMB_MATT_1',
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
    expenseId: '01REIMB_MATT_2',
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
    expenseId: '01REIMB_SARAH_1',
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
    expenseId: '01REIMB_MATT_3',
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
    expenseId: '01REIMB_SARAH_2',
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

function renderReimbursements() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <Reimbursements />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('Reimbursements Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListExpenses.mockResolvedValue(MOCK_EXPENSES);
  });

  describe('heading and structure', () => {
    it('renders the Reimbursements heading', async () => {
      renderReimbursements();
      expect(
        screen.getByRole('heading', { name: /reimbursements/i }),
      ).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows loading skeleton initially while fetching', () => {
      mockListExpenses.mockReturnValue(new Promise(() => {}));
      renderReimbursements();
      expect(
        screen.getByTestId('reimbursements-loading'),
      ).toBeInTheDocument();
    });
  });

  describe('total unreimbursed amount', () => {
    it('displays total unreimbursed amount prominently', async () => {
      renderReimbursements();
      // Matt owes: 7500 + 4000 = 11500 ($115.00)
      // Sarah owes: 12350 ($123.50)
      // Total: 23850 ($238.50)
      await waitFor(() => {
        expect(screen.getByText('$238.50')).toBeInTheDocument();
      });
    });
  });

  describe('reimbursement cards per authorized rep', () => {
    it('renders a card for each person who is owed money', async () => {
      renderReimbursements();
      await waitFor(() => {
        // Use getAllByText since names appear in both cards and table
        const mattElements = screen.getAllByText('Matt');
        expect(mattElements.length).toBeGreaterThanOrEqual(1);
      });
      const sarahElements = screen.getAllByText('Sarah');
      expect(sarahElements.length).toBeGreaterThanOrEqual(1);
    });

    it('shows correct total owed per person formatted as dollars', async () => {
      renderReimbursements();
      // Matt: 7500 + 4000 = $115.00 unreimbursed
      // Sarah: 12350 = $123.50 unreimbursed
      // $115.00 is unique (card only), $123.50 appears in both card and table row
      await waitFor(() => {
        expect(screen.getByText('$115.00')).toBeInTheDocument();
      });
      const sarahAmounts = screen.getAllByText('$123.50');
      expect(sarahAmounts.length).toBeGreaterThanOrEqual(1);
    });

    it('shows the count of unreimbursed expenses per person', async () => {
      renderReimbursements();
      await waitFor(() => {
        // Matt has 2 unreimbursed, Sarah has 1 unreimbursed
        expect(screen.getByText('2 expenses')).toBeInTheDocument();
      });
      expect(screen.getByText('1 expense')).toBeInTheDocument();
    });
  });

  describe('unreimbursed expenses list', () => {
    it('shows an unreimbursed expenses section', async () => {
      renderReimbursements();
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /unreimbursed expenses/i }),
        ).toBeInTheDocument();
      });
    });

    it('displays only unreimbursed expenses (excludes reimbursed ones)', async () => {
      renderReimbursements();
      await waitFor(() => {
        expect(screen.getByText('City Transit Authority')).toBeInTheDocument();
      });
      expect(screen.getByText('Dr. Smith Family Practice')).toBeInTheDocument();
      expect(screen.getByText('Whole Foods Market')).toBeInTheDocument();
      // These are reimbursed and should NOT appear in the table
      expect(screen.queryByText('Amazon')).not.toBeInTheDocument();
      expect(screen.queryByText('Target')).not.toBeInTheDocument();
    });

    it('does not show a Reimbursed column', async () => {
      renderReimbursements();
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      const table = screen.getByRole('table');
      expect(within(table).queryByText('Reimbursed')).not.toBeInTheDocument();
    });
  });

  describe('Add Expense action', () => {
    it('renders an Add Expense button linking to /expenses/new', async () => {
      renderReimbursements();
      await waitFor(() => {
        const link = screen.getByRole('link', { name: /add expense/i });
        expect(link).toHaveAttribute('href', '/expenses/new');
      });
    });
  });

  describe('empty state', () => {
    it('shows helpful guidance when no expenses exist', async () => {
      mockListExpenses.mockResolvedValue([]);
      renderReimbursements();

      await waitFor(() => {
        expect(
          screen.getByText(/no expenses yet/i),
        ).toBeInTheDocument();
      });
    });

    it('shows an Add Expense link in empty state', async () => {
      mockListExpenses.mockResolvedValue([]);
      renderReimbursements();

      await waitFor(() => {
        expect(screen.getByText(/no expenses yet/i)).toBeInTheDocument();
      });

      const addLink = screen.getByRole('link', {
        name: /add your first expense/i,
      });
      expect(addLink).toHaveAttribute('href', '/expenses/new');
    });

    it('does not show reimbursement cards or table in empty state', async () => {
      mockListExpenses.mockResolvedValue([]);
      renderReimbursements();

      await waitFor(() => {
        expect(screen.getByText(/no expenses yet/i)).toBeInTheDocument();
      });

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('all-reimbursed state', () => {
    it('shows a congratulatory message when all expenses are reimbursed', async () => {
      const allReimbursed = MOCK_EXPENSES.map((e) => ({
        ...e,
        reimbursed: true,
        reimbursedAt: '2026-02-20T00:00:00Z',
      }));
      mockListExpenses.mockResolvedValue(allReimbursed);
      renderReimbursements();

      await waitFor(() => {
        expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
      });
    });
  });
});
