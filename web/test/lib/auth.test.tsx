import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../src/lib/auth';

/**
 * Helper: create a base64url-encoded JWT with given payload.
 */
function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${header}.${body}.mock-signature`;
}

/** Valid mock IdToken for test user */
function makeValidIdToken(): string {
  return makeJwt({
    email: 'test@example.com',
    sub: 'mock-cognito-sub-123',
    'custom:role': 'owner',
    'custom:accountId': 'acct_test_001',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

/** Expired mock IdToken */
function makeExpiredIdToken(): string {
  return makeJwt({
    email: 'test@example.com',
    sub: 'mock-cognito-sub-123',
    'custom:role': 'owner',
    'custom:accountId': 'acct_test_001',
    exp: Math.floor(Date.now() / 1000) - 100,
  });
}

// Mock the cognito module
vi.mock('../../src/lib/cognito', () => ({
  authenticateUser: vi.fn(),
  parseIdToken: vi.fn(),
  storeTokens: vi.fn(),
  loadTokens: vi.fn(),
  clearTokens: vi.fn(),
  isTokenExpired: vi.fn(),
}));

// Import mocked functions for control
import {
  authenticateUser,
  parseIdToken,
  storeTokens,
  loadTokens,
  clearTokens,
  isTokenExpired,
} from '../../src/lib/cognito';

const mockAuthenticateUser = vi.mocked(authenticateUser);
const mockParseIdToken = vi.mocked(parseIdToken);
const mockStoreTokens = vi.mocked(storeTokens);
const mockLoadTokens = vi.mocked(loadTokens);
const mockClearTokens = vi.mocked(clearTokens);
const mockIsTokenExpired = vi.mocked(isTokenExpired);

function TestConsumer() {
  const { isAuthenticated, user, isLoading, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="user">{user ? JSON.stringify(user) : 'null'}</span>
      <button onClick={() => login('test@example.com', 'mock-test-password')}>
        Login
      </button>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no stored tokens
    mockLoadTokens.mockReturnValue(null);
    mockIsTokenExpired.mockReturnValue(false);
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('starts with isAuthenticated=false, user=null, and isLoading transitions to false', async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('user')).toHaveTextContent('null');
  });

  it('login() calls authenticateUser, stores tokens, and populates user', async () => {
    const mockIdToken = makeValidIdToken();

    mockAuthenticateUser.mockResolvedValue({
      idToken: mockIdToken,
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    });

    mockParseIdToken.mockReturnValue({
      email: 'test@example.com',
      sub: 'mock-cognito-sub-123',
      role: 'owner',
      accountId: 'acct_test_001',
      displayName: 'test',
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    await act(async () => {
      screen.getByText('Login').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    });

    // Verify cognito functions were called
    expect(mockAuthenticateUser).toHaveBeenCalledWith(
      'test@example.com',
      'mock-test-password',
    );
    expect(mockStoreTokens).toHaveBeenCalled();
    expect(mockParseIdToken).toHaveBeenCalledWith(mockIdToken);

    const userJson = screen.getByTestId('user').textContent;
    expect(userJson).not.toBe('null');
    const user: unknown = JSON.parse(userJson!);
    expect(user).toHaveProperty('email', 'test@example.com');
    expect(user).toHaveProperty('displayName', 'test');
    expect(user).toHaveProperty('accountId', 'acct_test_001');
    expect(user).toHaveProperty('role', 'owner');
    expect(user).toHaveProperty('cognitoSub', 'mock-cognito-sub-123');
  });

  it('login() throws on invalid credentials', async () => {
    mockAuthenticateUser.mockRejectedValue(
      new Error('Incorrect username or password.'),
    );

    function FailLoginConsumer() {
      const { login } = useAuth();
      const handleLogin = async () => {
        try {
          await login('bad@example.com', 'mock-wrong-password');
        } catch (err: unknown) {
          const errorEl = document.getElementById('error');
          if (errorEl && err instanceof Error) {
            errorEl.textContent = err.message;
          }
        }
      };
      return (
        <div>
          <span id="error" />
          <button onClick={handleLogin}>FailLogin</button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <FailLoginConsumer />
      </AuthProvider>,
    );

    await act(async () => {
      screen.getByText('FailLogin').click();
    });

    await waitFor(() => {
      expect(document.getElementById('error')!.textContent).toBe(
        'Incorrect username or password.',
      );
    });
  });

  it('logout() clears tokens and auth state', async () => {
    const mockIdToken = makeValidIdToken();

    mockAuthenticateUser.mockResolvedValue({
      idToken: mockIdToken,
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    });

    mockParseIdToken.mockReturnValue({
      email: 'test@example.com',
      sub: 'mock-cognito-sub-123',
      role: 'owner',
      accountId: 'acct_test_001',
      displayName: 'test',
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    // Login first
    await act(async () => {
      screen.getByText('Login').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    });

    // Now logout
    await act(async () => {
      screen.getByText('Logout').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('user')).toHaveTextContent('null');
    });

    expect(mockClearTokens).toHaveBeenCalled();
  });

  it('restores session from stored tokens on mount when token is still valid', async () => {
    const mockIdToken = makeValidIdToken();

    mockLoadTokens.mockReturnValue({
      idToken: mockIdToken,
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    });

    mockIsTokenExpired.mockReturnValue(false);

    mockParseIdToken.mockReturnValue({
      email: 'test@example.com',
      sub: 'mock-cognito-sub-123',
      role: 'owner',
      accountId: 'acct_test_001',
      displayName: 'test',
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    });

    const userJson = screen.getByTestId('user').textContent;
    expect(userJson).not.toBe('null');
    const user: unknown = JSON.parse(userJson!);
    expect(user).toHaveProperty('email', 'test@example.com');
  });

  it('does NOT restore session when stored token is expired', async () => {
    const expiredToken = makeExpiredIdToken();

    mockLoadTokens.mockReturnValue({
      idToken: expiredToken,
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    });

    mockIsTokenExpired.mockReturnValue(true);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('user')).toHaveTextContent('null');
    expect(mockClearTokens).toHaveBeenCalled();
  });

  it('useAuth() throws when used outside AuthProvider', () => {
    // Suppress console.error for the expected error
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow();

    consoleSpy.mockRestore();
  });
});
