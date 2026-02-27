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

// --- Token Management ---
// Module-level storage for the Cognito ID token.
// Will be replaced with proper token storage (e.g., localStorage or Cognito SDK)
// once real Cognito integration is complete.

let idToken: string | null = null;

/**
 * Get the current Cognito ID token for API authorization.
 * Returns null if the user is not authenticated.
 */
export function getIdToken(): string | null {
  return idToken;
}

/**
 * Store the Cognito ID token after successful authentication.
 * Called internally by the AuthProvider on login.
 */
export function setIdToken(token: string): void {
  idToken = token;
}

/**
 * Clear the stored ID token on logout.
 */
export function clearIdToken(): void {
  idToken = null;
}

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
    // Store mock ID token — will be replaced with real Cognito token
    setIdToken(`mock-id-token-${Date.now()}`);
    setState({
      isAuthenticated: true,
      user,
      isLoading: false,
    });
  }, []);

  const logout = useCallback(() => {
    // In the future, this will call Cognito signOut and clear tokens
    clearIdToken();
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
