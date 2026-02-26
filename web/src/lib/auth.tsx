import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

export interface AuthUser {
  email: string;
  displayName: string;
  accountId: string;
  role: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  isLoading: boolean;
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

type AuthContextValue = AuthState & AuthActions;

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Mock login implementation.
 * Simulates Cognito USER_PASSWORD_AUTH flow.
 * Will be replaced with real fetch-based Cognito integration
 * once the infra stack is deployed.
 */
async function mockCognitoLogin(
  email: string,
  password: string,
): Promise<AuthUser> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Simulate invalid credentials
  if (email === 'bad@example.com' || password === 'wrongpassword') {
    throw new Error('Invalid credentials');
  }

  // Simulate successful auth — return mock user
  return {
    email,
    displayName: email.split('@')[0] ?? email,
    accountId: 'acct_mock_001',
    role: 'owner',
  };
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    isLoading: true,
  });

  // Check for existing session on mount
  useEffect(() => {
    // In the future, this will check for a valid Cognito session token
    // For now, just mark loading as complete
    setState((prev) => ({ ...prev, isLoading: false }));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const user = await mockCognitoLogin(email, password);
    setState({
      isAuthenticated: true,
      user,
      isLoading: false,
    });
  }, []);

  const logout = useCallback(() => {
    // In the future, this will call Cognito signOut and clear tokens
    setState({
      isAuthenticated: false,
      user: null,
      isLoading: false,
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
