import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../src/lib/auth';

function TestConsumer() {
  const { isAuthenticated, user, isLoading, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="user">{user ? JSON.stringify(user) : 'null'}</span>
      <button onClick={() => login('test@example.com', 'password123')}>
        Login
      </button>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

describe('AuthProvider', () => {
  it('starts with isAuthenticated=false, user=null, and isLoading transitions to false', async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    // After initial render and effect, isLoading should become false
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('user')).toHaveTextContent('null');
  });

  it('login() sets isAuthenticated=true and populates user on success', async () => {
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

    const userJson = screen.getByTestId('user').textContent;
    expect(userJson).not.toBe('null');
    const user = JSON.parse(userJson!);
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('displayName');
    expect(user).toHaveProperty('accountId');
    expect(user).toHaveProperty('role');
  });

  it('login() throws on invalid credentials', async () => {
    function FailLoginConsumer() {
      const { login } = useAuth();
      const handleLogin = async () => {
        try {
          await login('bad@example.com', 'wrongpassword');
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
      expect(document.getElementById('error')!.textContent).toBeTruthy();
    });
  });

  it('logout() clears auth state', async () => {
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
  });

  it('useAuth() throws when used outside AuthProvider', () => {
    // Suppress console.error for the expected error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow();

    consoleSpy.mockRestore();
  });
});
