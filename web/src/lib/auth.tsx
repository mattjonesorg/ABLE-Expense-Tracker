import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {
  authenticateUser,
  parseIdToken,
  storeTokens,
  loadTokens,
  clearTokens,
  isTokenExpired,
} from './cognito';

export interface AuthUser {
  email: string;
  displayName: string;
  accountId: string;
  role: string;
  cognitoSub: string;
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
    const tokens = loadTokens();

    if (tokens && !isTokenExpired(tokens.idToken)) {
      try {
        const userInfo = parseIdToken(tokens.idToken);
        setState({
          isAuthenticated: true,
          user: {
            email: userInfo.email,
            displayName: userInfo.displayName,
            accountId: userInfo.accountId,
            role: userInfo.role,
            cognitoSub: userInfo.sub,
          },
          isLoading: false,
        });
        return;
      } catch {
        // Token parse failed — fall through to clear
      }
    }

    // No valid session — clear any stale tokens
    if (tokens) {
      clearTokens();
    }

    setState((prev) => ({ ...prev, isLoading: false }));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await authenticateUser(email, password);
    storeTokens(tokens);

    const userInfo = parseIdToken(tokens.idToken);

    setState({
      isAuthenticated: true,
      user: {
        email: userInfo.email,
        displayName: userInfo.displayName,
        accountId: userInfo.accountId,
        role: userInfo.role,
        cognitoSub: userInfo.sub,
      },
      isLoading: false,
    });
  }, []);

  const logout = useCallback(() => {
    clearTokens();
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
