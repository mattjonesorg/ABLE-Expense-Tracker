import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MemoryRouter } from 'react-router-dom';
import { Login } from '../../src/pages/Login';
import { AuthProvider } from '../../src/lib/auth';

const mockLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../src/lib/auth', async () => {
  const actual = await vi.importActual('../../src/lib/auth');
  return {
    ...actual,
    useAuth: () => ({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      login: mockLogin,
      logout: vi.fn(),
    }),
  };
});

function renderLogin() {
  return render(
    <MantineProvider>
      <Notifications />
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogin.mockResolvedValue(undefined);
  });

  it('renders email input and password input', () => {
    renderLogin();

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('renders a submit button with text "Sign in"', () => {
    renderLogin();

    const button = screen.getByRole('button', { name: /sign in/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('shows validation error when email is empty on submit', async () => {
    const user = userEvent.setup();
    renderLogin();

    const button = screen.getByRole('button', { name: /sign in/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    });
  });

  it('shows validation error when password is empty on submit', async () => {
    const user = userEvent.setup();
    renderLogin();

    // Fill in email but leave password empty
    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, 'test@example.com');

    const button = screen.getByRole('button', { name: /sign in/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  it('calls login with email and password on valid submit', async () => {
    const user = userEvent.setup();
    renderLogin();

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');

    const button = screen.getByRole('button', { name: /sign in/i });
    await user.click(button);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  it('shows error notification on failed login', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));

    const user = userEvent.setup();
    renderLogin();

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'wrongpassword');

    const button = screen.getByRole('button', { name: /sign in/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
  });

  it('email and password inputs have proper labels for accessibility', () => {
    renderLogin();

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    expect(emailInput).toHaveAttribute('type', 'email');
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('form is keyboard navigable — submit on Enter', async () => {
    const user = userEvent.setup();
    renderLogin();

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await user.type(emailInput, 'test@example.com');
    await user.tab();
    await user.type(passwordInput, 'password123');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });
});
