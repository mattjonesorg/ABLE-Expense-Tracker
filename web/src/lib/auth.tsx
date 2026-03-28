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
  buildGoogleAuthorizeUrl,
  exchangeCodeForTokens,
  generatePkceChallenge,
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
  loginWithGoogle: () => Promise<void>;
  handleOAuthCallback: (code: string, state: string) => Promise<void>;
}

type AuthContextValue = AuthState & AuthActions;

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Get the current Cognito ID token for API authorization.
 * Reads from sessionStorage via the cognito module.
 * Returns null if the user is not authenticated or token is expired.
 */
export function getIdToken(): string | null {
  const tokens = loadTokens();
  if (tokens && !isTokenExpired(tokens.idToken)) {
    return tokens.idToken;
  }
  return null;
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

  const loginWithGoogle = useCallback(async () => {
    const { codeVerifier, codeChallenge } = await generatePkceChallenge();
    const oauthState = crypto.randomUUID();

    sessionStorage.setItem('oauth_code_verifier', codeVerifier);
    sessionStorage.setItem('oauth_state', oauthState);

    const redirectUri = `${window.location.origin}/auth/callback`;
    const authorizeUrl = buildGoogleAuthorizeUrl(
      redirectUri,
      codeChallenge,
      oauthState,
    );

    window.location.href = authorizeUrl;
  }, []);

  const handleOAuthCallback = useCallback(
    async (code: string, oauthState: string) => {
      const storedState = sessionStorage.getItem('oauth_state');
      if (oauthState !== storedState) {
        throw new Error(
          'OAuth state mismatch — possible CSRF attack. Please try again.',
        );
      }

      const codeVerifier = sessionStorage.getItem('oauth_code_verifier');
      if (!codeVerifier) {
        throw new Error('Missing PKCE code verifier. Please try again.');
      }

      const redirectUri = `${window.location.origin}/auth/callback`;
      const tokens = await exchangeCodeForTokens(
        code,
        redirectUri,
        codeVerifier,
      );

      // Clear OAuth session values
      sessionStorage.removeItem('oauth_state');
      sessionStorage.removeItem('oauth_code_verifier');

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
    },
    [],
  );

  return (
    <AuthContext.Provider
      value={{ ...state, login, logout, loginWithGoogle, handleOAuthCallback }}
    >
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
