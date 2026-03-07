import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '../src/components/AppShell';
import { Dashboard } from '../src/pages/Dashboard';
import { Expenses } from '../src/pages/Expenses';
import { ExpenseForm } from '../src/pages/ExpenseForm';
import { Reimbursements } from '../src/pages/Reimbursements';
import { Reports } from '../src/pages/Reports';
import { Login } from '../src/pages/Login';
import { AuthProvider } from '../src/lib/auth';
import type { ReimbursementSummary, Expense } from '../src/lib/types';

// --- Mocks ---

vi.mock('../src/lib/auth', async () => {
  const actual = await vi.importActual('../src/lib/auth');
  return {
    ...actual,
    useAuth: () => ({
      isAuthenticated: true,
      user: {
        email: 'test@example.com',
        displayName: 'Test User',
        accountId: 'acct_001',
        role: 'owner',
        cognitoSub: 'sub_001',
      },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    }),
  };
});

const mockGetReimbursementSummaries = vi.fn();
const mockListExpenses = vi.fn();
const mockCreateExpense = vi.fn();
const mockCategorizeExpense = vi.fn();
const mockReimburseExpense = vi.fn();

vi.mock('../src/lib/api', () => ({
  getReimbursementSummaries: (...args: unknown[]) =>
    mockGetReimbursementSummaries(...args),
  listExpenses: (...args: unknown[]) => mockListExpenses(...args),
  createExpense: (...args: unknown[]) => mockCreateExpense(...args),
  categorizeExpense: (...args: unknown[]) => mockCategorizeExpense(...args),
  reimburseExpense: (...args: unknown[]) => mockReimburseExpense(...args),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// --- Test Data ---

function mockSummaries(): ReimbursementSummary[] {
  return [
    {
      userId: 'user1',
      displayName: 'John Doe',
      totalOwed: 7500,
      expenseCount: 3,
    },
  ];
}

function mockExpenses(): Expense[] {
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
  ];
}

// --- Helpers ---

function renderWithShell(initialRoute = '/') {
  return render(
    <MantineProvider>
      <Notifications />
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/expenses/new" element={<ExpenseForm />} />
            <Route path="/reimbursements" element={<Reimbursements />} />
            <Route path="/reports" element={<Reports />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

function renderPage(
  component: React.ReactElement,
  route = '/',
) {
  return render(
    <MantineProvider>
      <Notifications />
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{component}</AuthProvider>
      </MemoryRouter>
    </MantineProvider>,
  );
}

// --- Tests ---

describe('Accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReimbursementSummaries.mockResolvedValue(mockSummaries());
    mockListExpenses.mockResolvedValue(mockExpenses());
  });

  describe('Skip to main content link', () => {
    it('renders a skip-to-content link in the AppShell', () => {
      renderWithShell();
      const skipLink = screen.getByText('Skip to main content');
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveAttribute('href', '#main-content');
    });

    it('main content area has the matching id', () => {
      renderWithShell();
      const main = screen.getByRole('main');
      expect(main).toHaveAttribute('id', 'main-content');
    });
  });

  describe('Heading hierarchy', () => {
    it('Dashboard uses h1 as the primary page heading', async () => {
      renderWithShell('/');
      const heading = screen.getByRole('heading', { name: /dashboard/i });
      expect(heading.tagName).toBe('H1');
    });

    it('Expenses uses h1 as the primary page heading', async () => {
      renderWithShell('/expenses');
      const heading = screen.getByRole('heading', { name: /expenses/i });
      expect(heading.tagName).toBe('H1');
    });

    it('ExpenseForm uses h1 as the primary page heading', async () => {
      renderWithShell('/expenses/new');
      const heading = screen.getByRole('heading', { name: /new expense/i });
      expect(heading.tagName).toBe('H1');
    });

    it('Reimbursements uses h1 as the primary page heading', async () => {
      renderWithShell('/reimbursements');
      const heading = screen.getByRole('heading', {
        name: /reimbursements/i,
      });
      expect(heading.tagName).toBe('H1');
    });

    it('Reports uses h1 as the primary page heading', async () => {
      renderWithShell('/reports');
      const heading = screen.getByRole('heading', { name: /reports/i });
      expect(heading.tagName).toBe('H1');
    });

    it('Dashboard sub-headings use h2', async () => {
      renderWithShell('/');
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /quick actions/i }),
        ).toBeInTheDocument();
      });
      const quickActions = screen.getByRole('heading', {
        name: /quick actions/i,
      });
      expect(quickActions.tagName).toBe('H2');
    });
  });

  describe('Landmark regions', () => {
    it('has a navigation landmark with accessible name', () => {
      renderWithShell();
      expect(
        screen.getByRole('navigation', { name: /main navigation/i }),
      ).toBeInTheDocument();
    });

    it('has a main content landmark', () => {
      renderWithShell();
      expect(screen.getByRole('main')).toBeInTheDocument();
    });
  });

  describe('Loading states are announced to screen readers', () => {
    it('Dashboard loading skeleton has role="status"', () => {
      mockGetReimbursementSummaries.mockImplementation(
        () => new Promise(() => {}),
      );
      mockListExpenses.mockImplementation(() => new Promise(() => {}));
      renderWithShell('/');
      const loading = screen.getByTestId('dashboard-loading');
      expect(loading).toHaveAttribute('role', 'status');
      expect(loading).toHaveAttribute('aria-label', 'Loading dashboard data');
    });

    it('Expenses loading skeleton has role="status"', () => {
      mockListExpenses.mockImplementation(() => new Promise(() => {}));
      renderWithShell('/expenses');
      const loading = screen.getByTestId('expenses-loading');
      expect(loading).toHaveAttribute('role', 'status');
      expect(loading).toHaveAttribute('aria-label', 'Loading expenses');
    });

    it('Reimbursements loading skeleton has role="status"', () => {
      mockListExpenses.mockImplementation(() => new Promise(() => {}));
      renderWithShell('/reimbursements');
      const loading = screen.getByTestId('reimbursements-loading');
      expect(loading).toHaveAttribute('role', 'status');
      expect(loading).toHaveAttribute(
        'aria-label',
        'Loading reimbursements',
      );
    });

    it('Reports loading skeleton has role="status"', () => {
      mockListExpenses.mockImplementation(() => new Promise(() => {}));
      renderWithShell('/reports');
      const loading = screen.getByTestId('reports-loading');
      expect(loading).toHaveAttribute('role', 'status');
      expect(loading).toHaveAttribute('aria-label', 'Loading reports');
    });
  });

  describe('Error states are announced to screen readers', () => {
    it('Dashboard error has role="alert"', async () => {
      mockGetReimbursementSummaries.mockRejectedValue(
        new Error('Network error'),
      );
      renderWithShell('/');
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  describe('Decorative icons are hidden from screen readers', () => {
    it('nav icons have aria-hidden', () => {
      renderWithShell();
      // All nav link icons should be aria-hidden
      const nav = screen.getByRole('navigation', {
        name: /main navigation/i,
      });
      const svgs = nav.querySelectorAll('svg');
      svgs.forEach((svg) => {
        expect(svg).toHaveAttribute('aria-hidden', 'true');
      });
    });
  });

  describe('Tables have accessible labels', () => {
    it('Expenses table has aria-label', async () => {
      renderWithShell('/expenses');
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });
      expect(screen.getByRole('table')).toHaveAttribute(
        'aria-label',
        'Expense list',
      );
    });

    it('Reimbursements table has aria-label', async () => {
      renderWithShell('/reimbursements');
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });
      expect(screen.getByRole('table')).toHaveAttribute(
        'aria-label',
        'Unreimbursed expenses',
      );
    });

    it('Reports category table has aria-label', async () => {
      renderWithShell('/reports');
      await waitFor(() => {
        expect(screen.getByTestId('category-table')).toBeInTheDocument();
      });
      const categoryTable = screen.getByTestId('category-table').querySelector('table');
      expect(categoryTable).toHaveAttribute(
        'aria-label',
        'Expenses by category',
      );
    });

    it('Reports person table has aria-label', async () => {
      renderWithShell('/reports');
      await waitFor(() => {
        expect(screen.getByTestId('person-table')).toBeInTheDocument();
      });
      const personTable = screen.getByTestId('person-table').querySelector('table');
      expect(personTable).toHaveAttribute(
        'aria-label',
        'Expenses by person',
      );
    });
  });

  describe('Forms have accessible labels', () => {
    it('Login form has aria-label', () => {
      render(
        <MantineProvider>
          <Notifications />
          <MemoryRouter initialEntries={['/login']}>
            <AuthProvider>
              <Login />
            </AuthProvider>
          </MemoryRouter>
        </MantineProvider>,
      );
      expect(screen.getByRole('form', { name: /sign in form/i })).toBeInTheDocument();
    });

    it('Expense form has aria-label', () => {
      renderWithShell('/expenses/new');
      expect(
        screen.getByRole('form', { name: /new expense form/i }),
      ).toBeInTheDocument();
    });
  });

  describe('Clickable table rows are keyboard accessible', () => {
    it('Expenses table rows do not have misleading cursor or click handlers', async () => {
      renderWithShell('/expenses');
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });
      // Rows should not have cursor: pointer style since click is a placeholder
      const dataRows = screen.getAllByRole('row').slice(1); // skip header
      dataRows.forEach((row) => {
        expect(row.style.cursor).not.toBe('pointer');
      });
    });
  });
});
