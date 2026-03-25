import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '../../src/components/AppShell';

const mockLogout = vi.fn();
const mockNavigate = vi.fn();
let mockIsAuthenticated = true;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    user: mockIsAuthenticated
      ? {
          email: 'matt@example.com',
          displayName: 'matt',
          accountId: 'acct_001',
          role: 'owner',
        }
      : null,
    isLoading: false,
    login: vi.fn(),
    logout: mockLogout,
  }),
}));

function renderAppShell(initialRoute = '/') {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<div>Dashboard Page</div>} />
            <Route path="/expenses" element={<div>Expenses Page</div>} />
            <Route path="/expenses/new" element={<div>New Expense Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('AppShell (AppLayout)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
    sessionStorage.clear();
  });

  describe('Header', () => {
    it('renders the app title "ABLE Tracker"', () => {
      renderAppShell();
      expect(screen.getByText('ABLE Tracker')).toBeInTheDocument();
    });

    it('displays the user display name', () => {
      renderAppShell();
      expect(screen.getByText('matt')).toBeInTheDocument();
    });

    it('renders a logout button', () => {
      renderAppShell();
      const logoutButton = screen.getByRole('button', { name: /log\s*out/i });
      expect(logoutButton).toBeInTheDocument();
    });

    it('calls logout when logout button is clicked', async () => {
      const user = userEvent.setup();
      renderAppShell();

      const logoutButton = screen.getByRole('button', { name: /log\s*out/i });
      await user.click(logoutButton);

      expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    it('navigates to /login after logout', async () => {
      const user = userEvent.setup();
      renderAppShell();

      const logoutButton = screen.getByRole('button', { name: /log\s*out/i });
      await user.click(logoutButton);

      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  describe('Navigation', () => {
    it('renders a Dashboard nav link', () => {
      renderAppShell();
      expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    });

    it('renders an Expenses nav link', () => {
      renderAppShell();
      expect(screen.getByRole('link', { name: /^expenses$/i })).toBeInTheDocument();
    });

    it('renders a New Expense nav link', () => {
      renderAppShell();
      expect(screen.getByRole('link', { name: /new expense/i })).toBeInTheDocument();
    });

    it('Dashboard link points to /', () => {
      renderAppShell();
      const link = screen.getByRole('link', { name: /dashboard/i });
      expect(link).toHaveAttribute('href', '/');
    });

    it('Expenses link points to /expenses', () => {
      renderAppShell();
      const link = screen.getByRole('link', { name: /^expenses$/i });
      expect(link).toHaveAttribute('href', '/expenses');
    });

    it('New Expense link points to /expenses/new', () => {
      renderAppShell();
      const link = screen.getByRole('link', { name: /new expense/i });
      expect(link).toHaveAttribute('href', '/expenses/new');
    });
  });

  describe('Content area', () => {
    it('renders child route content for /', () => {
      renderAppShell('/');
      expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
    });

    it('renders child route content for /expenses', () => {
      renderAppShell('/expenses');
      expect(screen.getByText('Expenses Page')).toBeInTheDocument();
    });

    it('renders child route content for /expenses/new', () => {
      renderAppShell('/expenses/new');
      expect(screen.getByText('New Expense Page')).toBeInTheDocument();
    });
  });

  describe('Responsive behavior', () => {
    it('renders a burger button for mobile navigation toggle', () => {
      renderAppShell();
      const burger = screen.getByRole('button', { name: /toggle navigation/i });
      expect(burger).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('navigation has proper nav landmark with aria-label', () => {
      renderAppShell();
      expect(
        screen.getByRole('navigation', { name: /main navigation/i }),
      ).toBeInTheDocument();
    });

    it('main content area is a main landmark', () => {
      renderAppShell();
      expect(screen.getByRole('main')).toBeInTheDocument();
    });
  });

  describe('Return-to-URL (#81)', () => {
    it('saves current path to sessionStorage when redirecting unauthenticated user', () => {
      mockIsAuthenticated = false;

      render(
        <MantineProvider>
          <MemoryRouter initialEntries={['/expenses']}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/expenses" element={<div>Expenses Page</div>} />
              </Route>
              <Route path="/login" element={<div>Login Page</div>} />
            </Routes>
          </MemoryRouter>
        </MantineProvider>,
      );

      expect(sessionStorage.getItem('returnTo')).toBe('/expenses');
    });

    it('does not save /login as the return path', () => {
      mockIsAuthenticated = false;

      render(
        <MantineProvider>
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<div>Dashboard</div>} />
              </Route>
              <Route path="/login" element={<div>Login Page</div>} />
            </Routes>
          </MemoryRouter>
        </MantineProvider>,
      );

      expect(sessionStorage.getItem('returnTo')).toBeNull();
    });

    it('does not save / as the return path', () => {
      mockIsAuthenticated = false;

      render(
        <MantineProvider>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<div>Dashboard</div>} />
              </Route>
              <Route path="/login" element={<div>Login Page</div>} />
            </Routes>
          </MemoryRouter>
        </MantineProvider>,
      );

      expect(sessionStorage.getItem('returnTo')).toBeNull();
    });
  });
});
