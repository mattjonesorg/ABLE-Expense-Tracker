import { useState } from 'react';
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
  buildGoogleAuthorizeUrl: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  generatePkceChallenge: vi.fn(),
}));

// Mock config to enable Google IDP
vi.mock('../../src/lib/config', () => ({
  getCognitoConfig: () => ({
    userPoolId: 'us-east-1_TestPool',
    clientId: 'test-client-id',
    region: 'us-east-1',
    cognitoEndpoint: 'https://cognito-idp.us-east-1.amazonaws.com/',
    cognitoDomain: 'https://test.auth.us-east-1.amazoncognito.com',
    googleIdpEnabled: true,
  }),
  API_URL: 'https://test.example.com',
}));

// Import mocked functions for control
import {
  authenticateUser,
  parseIdToken,
  storeTokens,
  loadTokens,
  clearTokens,
  isTokenExpired,
  buildGoogleAuthorizeUrl,
  exchangeCodeForTokens,
  generatePkceChallenge,
} from '../../src/lib/cognito';

const mockAuthenticateUser = vi.mocked(authenticateUser);
const mockParseIdToken = vi.mocked(parseIdToken);
const mockStoreTokens = vi.mocked(storeTokens);
const mockLoadTokens = vi.mocked(loadTokens);
const mockClearTokens = vi.mocked(clearTokens);
const mockIsTokenExpired = vi.mocked(isTokenExpired);
const mockBuildGoogleAuthorizeUrl = vi.mocked(buildGoogleAuthorizeUrl);
const mockExchangeCodeForTokens = vi.mocked(exchangeCodeForTokens);
const mockGeneratePkceChallenge = vi.mocked(generatePkceChallenge);

function TestConsumer() {
  const {
    isAuthenticated,
    user,
    isLoading,
    login,
    logout,
    loginWithGoogle,
    handleOAuthCallback,
  } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="user">{user ? JSON.stringify(user) : 'null'}</span>
      <button onClick={() => login('test@example.com', 'mock-test-password')}>
        Login
      </button>
      <button onClick={logout}>Logout</button>
      <button onClick={loginWithGoogle}>GoogleLogin</button>
      <button onClick={() => handleOAuthCallback('test-code', 'test-state')}>
        OAuthCallback
      </button>
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

  describe('loginWithGoogle', () => {
    let originalLocation: Location;

    beforeEach(() => {
      originalLocation = window.location;
      // @ts-expect-error -- replacing location for redirect testing
      delete window.location;
      window.location = { ...originalLocation, href: '' } as Location;

      mockGeneratePkceChallenge.mockResolvedValue({
        codeVerifier: 'mock-code-verifier-123',
        codeChallenge: 'mock-code-challenge-456',
      });
      mockBuildGoogleAuthorizeUrl.mockReturnValue(
        'https://test.auth.us-east-1.amazoncognito.com/oauth2/authorize?test=1',
      );
    });

    afterEach(() => {
      window.location = originalLocation;
    });

    it('stores code_verifier and state in sessionStorage and redirects', async () => {
      // Use a consumer that catches async errors
      function GoogleLoginConsumer() {
        const { loginWithGoogle } = useAuth();
        const [error, setError] = useState('');
        const handleClick = async () => {
          try {
            await loginWithGoogle();
          } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'unknown error');
          }
        };
        return (
          <div>
            <button onClick={handleClick}>GoogleLogin</button>
            <span data-testid="google-error">{error}</span>
          </div>
        );
      }

      render(
        <AuthProvider>
          <GoogleLoginConsumer />
        </AuthProvider>,
      );

      await act(async () => {
        screen.getByText('GoogleLogin').click();
      });

      // Wait for the async loginWithGoogle to complete
      await waitFor(() => {
        // Either the code verifier was set, or we have an error
        const verifier = sessionStorage.getItem('oauth_code_verifier');
        const error = screen.getByTestId('google-error').textContent;
        expect(verifier || error).toBeTruthy();
      });

      // Check for errors first
      const errorText = screen.getByTestId('google-error').textContent;
      if (errorText) {
        throw new Error(`loginWithGoogle threw: ${errorText}`);
      }

      expect(sessionStorage.getItem('oauth_code_verifier')).toBe(
        'mock-code-verifier-123',
      );

      // Should store a random state value
      const storedState = sessionStorage.getItem('oauth_state');
      expect(storedState).toBeTruthy();
      expect(storedState!.length).toBeGreaterThan(0);

      // Should call buildGoogleAuthorizeUrl with correct params
      expect(mockBuildGoogleAuthorizeUrl).toHaveBeenCalledWith(
        expect.stringContaining('/auth/callback'),
        'mock-code-challenge-456',
        storedState,
      );

      // Should redirect to the authorize URL
      expect(window.location.href).toBe(
        'https://test.auth.us-east-1.amazoncognito.com/oauth2/authorize?test=1',
      );
    });
  });

  describe('handleOAuthCallback', () => {
    it('validates state, exchanges code for tokens, and updates auth state', async () => {
      const mockIdToken = makeValidIdToken();

      sessionStorage.setItem('oauth_state', 'test-state');
      sessionStorage.setItem('oauth_code_verifier', 'test-verifier');

      mockExchangeCodeForTokens.mockResolvedValue({
        idToken: mockIdToken,
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });

      mockParseIdToken.mockReturnValue({
        email: 'google@example.com',
        sub: 'google-sub-123',
        role: 'owner',
        accountId: 'acct_google',
        displayName: 'google',
      });

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      // Fire the click — the handler is async, so we need to wait for side effects
      screen.getByText('OAuthCallback').click();

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      });

      // Should exchange code for tokens
      expect(mockExchangeCodeForTokens).toHaveBeenCalledWith(
        'test-code',
        expect.stringContaining('/auth/callback'),
        'test-verifier',
      );

      // Should store tokens
      expect(mockStoreTokens).toHaveBeenCalled();

      // Should parse ID token
      expect(mockParseIdToken).toHaveBeenCalledWith(mockIdToken);

      // Should clear OAuth session values
      expect(sessionStorage.getItem('oauth_state')).toBeNull();
      expect(sessionStorage.getItem('oauth_code_verifier')).toBeNull();

      // Should update user state
      const userJson = screen.getByTestId('user').textContent;
      expect(userJson).not.toBe('null');
      const user: unknown = JSON.parse(userJson!);
      expect(user).toHaveProperty('email', 'google@example.com');
    });

    it('throws when state does not match sessionStorage', async () => {
      sessionStorage.setItem('oauth_state', 'different-state');
      sessionStorage.setItem('oauth_code_verifier', 'test-verifier');

      function OAuthFailConsumer() {
        const { handleOAuthCallback } = useAuth();
        const handleClick = async () => {
          try {
            await handleOAuthCallback('test-code', 'wrong-state');
          } catch (err: unknown) {
            const errorEl = document.getElementById('oauth-error');
            if (errorEl && err instanceof Error) {
              errorEl.textContent = err.message;
            }
          }
        };
        return (
          <div>
            <span id="oauth-error" />
            <button onClick={handleClick}>TryOAuth</button>
          </div>
        );
      }

      render(
        <AuthProvider>
          <OAuthFailConsumer />
        </AuthProvider>,
      );

      await act(async () => {
        screen.getByText('TryOAuth').click();
      });

      await waitFor(() => {
        expect(document.getElementById('oauth-error')!.textContent).toMatch(
          /state mismatch/i,
        );
      });
    });
  });
});
