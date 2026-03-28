import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MemoryRouter } from 'react-router-dom';
import { Login } from '../../src/pages/Login';
import { AuthProvider } from '../../src/lib/auth';

const mockLogin = vi.fn();
const mockLoginWithGoogle = vi.fn();
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

let googleIdpEnabled = false;

vi.mock('../../src/lib/auth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    isAuthenticated: false,
    user: null,
    isLoading: false,
    login: mockLogin,
    logout: vi.fn(),
    loginWithGoogle: mockLoginWithGoogle,
    handleOAuthCallback: vi.fn(),
  }),
}));

vi.mock('../../src/lib/config', () => ({
  getCognitoConfig: () => ({
    userPoolId: 'us-east-1_TestPool',
    clientId: 'test-client-id',
    region: 'us-east-1',
    cognitoEndpoint: 'https://cognito-idp.us-east-1.amazonaws.com/',
    cognitoDomain: 'https://test.auth.us-east-1.amazoncognito.com',
    get googleIdpEnabled() {
      return googleIdpEnabled;
    },
  }),
  API_URL: 'https://test.example.com',
}));

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
    googleIdpEnabled = false;
    sessionStorage.clear();
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

  describe('Return-to-URL (#81)', () => {
    it('navigates to saved returnTo path after login', async () => {
      sessionStorage.setItem('returnTo', '/expenses');

      const user = userEvent.setup();
      renderLogin();

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/expenses');
      });
    });

    it('clears returnTo from sessionStorage after use', async () => {
      sessionStorage.setItem('returnTo', '/expenses');

      const user = userEvent.setup();
      renderLogin();

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalled();
      });
      expect(sessionStorage.getItem('returnTo')).toBeNull();
    });

    it('rejects protocol-relative returnTo paths', async () => {
      sessionStorage.setItem('returnTo', '//evil.com');

      const user = userEvent.setup();
      renderLogin();

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('rejects returnTo paths that do not start with /', async () => {
      sessionStorage.setItem('returnTo', 'https://evil.com');

      const user = userEvent.setup();
      renderLogin();

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('navigates to / when no returnTo is saved', async () => {
      const user = userEvent.setup();
      renderLogin();

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });
  });

  describe('Google OAuth', () => {
    it('does NOT render Google sign-in button when googleIdpEnabled is false', () => {
      googleIdpEnabled = false;
      renderLogin();

      expect(
        screen.queryByRole('button', { name: /sign in with google/i }),
      ).not.toBeInTheDocument();
    });

    it('renders Google sign-in button when googleIdpEnabled is true', () => {
      googleIdpEnabled = true;
      renderLogin();

      expect(
        screen.getByRole('button', { name: /sign in with google/i }),
      ).toBeInTheDocument();
    });

    it('calls loginWithGoogle when Google button is clicked', async () => {
      googleIdpEnabled = true;
      const user = userEvent.setup();
      renderLogin();

      await user.click(
        screen.getByRole('button', { name: /sign in with google/i }),
      );

      expect(mockLoginWithGoogle).toHaveBeenCalledTimes(1);
    });

    it('renders divider between form and Google button when enabled', () => {
      googleIdpEnabled = true;
      renderLogin();

      expect(screen.getByText('or')).toBeInTheDocument();
    });
  });
});
