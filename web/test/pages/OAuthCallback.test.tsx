import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';

const mockHandleOAuthCallback = vi.fn();
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
      login: vi.fn(),
      logout: vi.fn(),
      loginWithGoogle: vi.fn(),
      handleOAuthCallback: mockHandleOAuthCallback,
    }),
  };
});

import { OAuthCallback } from '../../src/pages/OAuthCallback';

function renderCallback(search: string) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
        <OAuthCallback />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('OAuthCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('shows error when no code parameter in URL', () => {
    renderCallback('');

    expect(screen.getByText(/missing authorization code/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('shows error when no state parameter in URL', () => {
    renderCallback('?code=test-code');

    expect(screen.getByText(/missing state parameter/i)).toBeInTheDocument();
  });

  it('shows error when state does not match sessionStorage value', async () => {
    sessionStorage.setItem('oauth_state', 'expected-state');
    sessionStorage.setItem('oauth_code_verifier', 'test-verifier');

    renderCallback('?code=test-code&state=wrong-state');

    await waitFor(() => {
      expect(screen.getByText(/state mismatch/i)).toBeInTheDocument();
    });
    expect(mockHandleOAuthCallback).not.toHaveBeenCalled();
  });

  it('calls handleOAuthCallback with code and state on valid params', async () => {
    sessionStorage.setItem('oauth_state', 'valid-state');
    sessionStorage.setItem('oauth_code_verifier', 'test-verifier');
    mockHandleOAuthCallback.mockResolvedValue(undefined);

    renderCallback('?code=auth-code-123&state=valid-state');

    await waitFor(() => {
      expect(mockHandleOAuthCallback).toHaveBeenCalledWith(
        'auth-code-123',
        'valid-state',
      );
    });
  });

  it('navigates to / on successful callback', async () => {
    sessionStorage.setItem('oauth_state', 'valid-state');
    sessionStorage.setItem('oauth_code_verifier', 'test-verifier');
    mockHandleOAuthCallback.mockResolvedValue(undefined);

    renderCallback('?code=auth-code-123&state=valid-state');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('navigates to returnTo path on successful callback', async () => {
    sessionStorage.setItem('oauth_state', 'valid-state');
    sessionStorage.setItem('oauth_code_verifier', 'test-verifier');
    sessionStorage.setItem('returnTo', '/expenses');
    mockHandleOAuthCallback.mockResolvedValue(undefined);

    renderCallback('?code=auth-code-123&state=valid-state');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/expenses', { replace: true });
    });
  });

  it('shows error when token exchange fails', async () => {
    sessionStorage.setItem('oauth_state', 'valid-state');
    sessionStorage.setItem('oauth_code_verifier', 'test-verifier');
    mockHandleOAuthCallback.mockRejectedValue(
      new Error('Failed to exchange authorization code'),
    );

    renderCallback('?code=bad-code&state=valid-state');

    await waitFor(() => {
      expect(
        screen.getByText(/failed to exchange authorization code/i),
      ).toBeInTheDocument();
    });
  });

  it('shows loading state during exchange', () => {
    sessionStorage.setItem('oauth_state', 'valid-state');
    sessionStorage.setItem('oauth_code_verifier', 'test-verifier');
    // Never resolves — keeps loading state
    mockHandleOAuthCallback.mockReturnValue(new Promise(() => {}));

    renderCallback('?code=auth-code-123&state=valid-state');

    expect(screen.getByText(/signing in/i)).toBeInTheDocument();
  });
});
