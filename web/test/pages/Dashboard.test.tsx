import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from '../../src/pages/Dashboard';
import type { ReimbursementSummary, Expense } from '../../src/lib/types';

// --- Mocks ---

vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: {
      email: 'matt@example.com',
      displayName: 'matt',
      accountId: 'acct_001',
      role: 'owner',
    },
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

const mockGetReimbursementSummaries = vi.fn();
const mockListExpenses = vi.fn();

vi.mock('../../src/lib/api', () => ({
  getReimbursementSummaries: (...args: unknown[]) => mockGetReimbursementSummaries(...args),
  listExpenses: (...args: unknown[]) => mockListExpenses(...args),
}));

// --- Helpers ---

function renderDashboard() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </MantineProvider>,
  );
}

function mockSummaries(): ReimbursementSummary[] {
  return [
    { userId: 'user1', displayName: 'John Doe', totalOwed: 7500, expenseCount: 3 },
    { userId: 'user2', displayName: 'Jane Smith', totalOwed: 12050, expenseCount: 5 },
  ];
}

function mockRecentExpenses(): Expense[] {
  const now = new Date().toISOString();
  return [
    {
      expenseId: 'exp_1',
      accountId: 'acct_001',
      date: '2026-03-01',
      vendor: 'Office Depot',
      description: 'Printer paper',
      amount: 2499,
      category: 'Education',
      categoryConfidence: 'user_selected',
      categoryNotes: '',
      receiptKey: null,
      submittedBy: 'user1',
      paidBy: 'John Doe',
      reimbursed: false,
      reimbursedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      expenseId: 'exp_2',
      accountId: 'acct_001',
      date: '2026-02-28',
      vendor: 'Amazon',
      description: 'Assistive keyboard',
      amount: 8999,
      category: 'Assistive technology & personal support',
      categoryConfidence: 'ai_suggested',
      categoryNotes: '',
      receiptKey: null,
      submittedBy: 'user2',
      paidBy: 'Jane Smith',
      reimbursed: false,
      reimbursedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

// --- Tests ---

describe('Dashboard Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReimbursementSummaries.mockResolvedValue(mockSummaries());
    mockListExpenses.mockResolvedValue(mockRecentExpenses());
  });

  describe('Layout and headings', () => {
    it('renders the Dashboard heading', () => {
      renderDashboard();
      expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    });

    it('renders a welcome message with user display name', () => {
      renderDashboard();
      expect(screen.getByText(/welcome,\s*matt/i)).toBeInTheDocument();
    });

    it('is accessible with proper heading hierarchy', async () => {
      renderDashboard();
      await waitFor(() => {
        const headings = screen.getAllByRole('heading');
        expect(headings.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('Quick actions', () => {
    it('renders an Add Expense quick action card', () => {
      renderDashboard();
      expect(screen.getByText(/add expense/i)).toBeInTheDocument();
    });

    it('renders a View Expenses quick action card', () => {
      renderDashboard();
      expect(screen.getByText(/view expenses/i)).toBeInTheDocument();
    });

    it('the Add Expense card links to /expenses/new', () => {
      renderDashboard();
      const addLink = screen.getByRole('link', { name: /add expense/i });
      expect(addLink).toHaveAttribute('href', '/expenses/new');
    });

    it('the View Expenses card links to /expenses', () => {
      renderDashboard();
      const viewLink = screen.getByRole('link', { name: /view expenses/i });
      expect(viewLink).toHaveAttribute('href', '/expenses');
    });
  });

  describe('Reimbursement summaries', () => {
    it('fetches reimbursement summaries on mount', async () => {
      renderDashboard();
      await waitFor(() => {
        expect(mockGetReimbursementSummaries).toHaveBeenCalledTimes(1);
      });
    });

    it('displays total unreimbursed amount', async () => {
      renderDashboard();
      // $75.00 + $120.50 = $195.50
      await waitFor(() => {
        expect(screen.getByText('$195.50')).toBeInTheDocument();
      });
    });

    it('renders a reimbursement card for each person', async () => {
      renderDashboard();
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });
    });

    it('displays per-person amounts formatted as dollars', async () => {
      renderDashboard();
      await waitFor(() => {
        expect(screen.getByText(/\$75\.00/)).toBeInTheDocument();
        expect(screen.getByText(/\$120\.50/)).toBeInTheDocument();
      });
    });

    it('displays expense count per person', async () => {
      renderDashboard();
      await waitFor(() => {
        expect(screen.getByText(/3 expenses/i)).toBeInTheDocument();
        expect(screen.getByText(/5 expenses/i)).toBeInTheDocument();
      });
    });

    it('shows a Reimbursements heading', async () => {
      renderDashboard();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /reimbursements/i })).toBeInTheDocument();
      });
    });
  });

  describe('Recent expenses', () => {
    it('fetches recent expenses on mount', async () => {
      renderDashboard();
      await waitFor(() => {
        expect(mockListExpenses).toHaveBeenCalledTimes(1);
      });
    });

    it('shows a Recent Expenses heading', async () => {
      renderDashboard();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /recent expenses/i })).toBeInTheDocument();
      });
    });

    it('displays recent expense vendors', async () => {
      renderDashboard();
      await waitFor(() => {
        expect(screen.getByText('Office Depot')).toBeInTheDocument();
        expect(screen.getByText('Amazon')).toBeInTheDocument();
      });
    });

    it('displays recent expense amounts', async () => {
      renderDashboard();
      await waitFor(() => {
        expect(screen.getByText('$24.99')).toBeInTheDocument();
        expect(screen.getByText('$89.99')).toBeInTheDocument();
      });
    });
  });

  describe('Empty state', () => {
    it('shows empty state when no summaries and no expenses', async () => {
      mockGetReimbursementSummaries.mockResolvedValue([]);
      mockListExpenses.mockResolvedValue([]);

      renderDashboard();
      await waitFor(() => {
        expect(screen.getByText(/no expenses yet/i)).toBeInTheDocument();
      });
    });

    it('shows link to add first expense in empty state', async () => {
      mockGetReimbursementSummaries.mockResolvedValue([]);
      mockListExpenses.mockResolvedValue([]);

      renderDashboard();
      await waitFor(() => {
        const link = screen.getByRole('link', { name: /add your first expense/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/expenses/new');
      });
    });
  });

  describe('Loading state', () => {
    it('shows loading skeleton while data is fetching', () => {
      mockGetReimbursementSummaries.mockImplementation(() => new Promise(() => {}));
      mockListExpenses.mockImplementation(() => new Promise(() => {}));

      renderDashboard();
      expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    it('shows error message when reimbursement fetch fails', async () => {
      mockGetReimbursementSummaries.mockRejectedValue(new Error('Network error'));

      renderDashboard();
      await waitFor(() => {
        expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
      });
    });
  });
});
