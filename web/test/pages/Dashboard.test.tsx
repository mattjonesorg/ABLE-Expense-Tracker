import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from '../../src/pages/Dashboard';

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

function renderDashboard() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('Dashboard Page', () => {
  it('renders a welcome message with user display name', () => {
    renderDashboard();
    expect(screen.getByText(/welcome,\s*matt/i)).toBeInTheDocument();
  });

  it('renders a heading for the dashboard', () => {
    renderDashboard();
    expect(
      screen.getByRole('heading', { name: /dashboard/i }),
    ).toBeInTheDocument();
  });

  it('renders a quick action card to add an expense', () => {
    renderDashboard();
    expect(screen.getByText(/add expense/i)).toBeInTheDocument();
  });

  it('renders a quick action card to view expenses', () => {
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

  it('is accessible with proper heading hierarchy', () => {
    renderDashboard();
    const headings = screen.getAllByRole('heading');
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });
});
