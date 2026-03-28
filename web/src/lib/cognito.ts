/**
 * Low-level Cognito authentication functions.
 *
 * Uses fetch against the Cognito public endpoint directly —
 * no AWS SDK or Amplify dependency required.
 */

import { getCognitoConfig } from './config';

// ---- Types ----

export interface CognitoTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
}

export interface CognitoUserInfo {
  email: string;
  sub: string;
  role: string;
  accountId: string;
  displayName: string;
}

/** Shape of a decoded JWT payload (partial — only fields we use) */
interface JwtPayload {
  email?: string;
  sub?: string;
  'custom:role'?: string;
  'custom:accountId'?: string;
  exp?: number;
}

/** Cognito successful auth response */
interface CognitoAuthResult {
  AuthenticationResult?: {
    IdToken: string;
    AccessToken: string;
    RefreshToken: string;
    ExpiresIn: number;
  };
  ChallengeName?: string;
}

/** Cognito error response */
interface CognitoErrorResponse {
  __type?: string;
  message?: string;
}

// ---- Constants ----

const STORAGE_KEY = 'able_tracker_tokens';

/** Buffer in seconds — treat tokens as expired this much before actual expiry */
const EXPIRY_BUFFER_SECONDS = 60;

// ---- JWT Parsing ----

/**
 * Decode a base64url-encoded string to a regular string.
 * JWT uses base64url encoding (RFC 4648 section 5).
 */
function base64UrlDecode(input: string): string {
  // Replace base64url chars with standard base64 chars
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  const paddingNeeded = 4 - (base64.length % 4);
  if (paddingNeeded !== 4) {
    base64 += '='.repeat(paddingNeeded);
  }

  return atob(base64);
}

/**
 * Parse a JWT IdToken to extract user information.
 * Does NOT verify the signature — that is Cognito's responsibility.
 * We only decode the payload to read claims.
 *
 * @throws Error if the token is malformed or cannot be decoded
 */
export function parseIdToken(idToken: string): CognitoUserInfo {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT: expected 3 segments');
  }

  const payloadSegment = parts[1];
  if (!payloadSegment) {
    throw new Error('Malformed JWT: missing payload segment');
  }

  let payload: JwtPayload;
  try {
    const decoded = base64UrlDecode(payloadSegment);
    payload = JSON.parse(decoded) as JwtPayload;
  } catch {
    throw new Error('Malformed JWT: could not decode payload');
  }

  const email = payload.email ?? '';
  const sub = payload.sub ?? '';
  const role = payload['custom:role'] ?? 'authorized_rep';
  const accountId = payload['custom:accountId'] ?? '';
  const displayName = email.split('@')[0] ?? email;

  return { email, sub, role, accountId, displayName };
}

/**
 * Check whether a JWT token is expired (or will expire within the buffer).
 * Returns true if expired, expiring soon, or if the token cannot be parsed.
 */
export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) {
      return true;
    }

    const decoded = base64UrlDecode(parts[1]);
    const payload = JSON.parse(decoded) as JwtPayload;

    if (typeof payload.exp !== 'number') {
      return true;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    return payload.exp <= nowSeconds + EXPIRY_BUFFER_SECONDS;
  } catch {
    return true;
  }
}

// ---- Token Storage (sessionStorage) ----

/**
 * Store Cognito tokens in sessionStorage.
 * Using sessionStorage instead of localStorage so tokens are cleared
 * when the browser tab is closed — a security best practice.
 */
export function storeTokens(tokens: CognitoTokens): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

/**
 * Load Cognito tokens from sessionStorage.
 * Returns null if no tokens are stored or if the stored data is invalid.
 */
export function loadTokens(): CognitoTokens | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    // Validate shape
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'idToken' in parsed &&
      'accessToken' in parsed &&
      'refreshToken' in parsed
    ) {
      return parsed as CognitoTokens;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Remove stored tokens from sessionStorage.
 */
export function clearTokens(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

// ---- PKCE Helpers ----

/**
 * Generate a random code verifier string (64 hex chars, URL-safe).
 * Uses crypto.getRandomValues for secure randomness.
 */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a SHA-256 code challenge from a code verifier (S256 method).
 */
async function generateCodeChallengeFromVerifier(
  verifier: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generate a PKCE code verifier and its S256 code challenge.
 */
export async function generatePkceChallenge(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallengeFromVerifier(codeVerifier);
  return { codeVerifier, codeChallenge };
}

// ---- OAuth / Google Sign-In ----

/**
 * Build the Cognito hosted UI authorize URL for Google sign-in.
 */
export function buildGoogleAuthorizeUrl(
  redirectUri: string,
  codeChallenge: string,
  state: string,
): string {
  const config = getCognitoConfig();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    identity_provider: 'Google',
    scope: 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });
  return `${config.cognitoDomain}/oauth2/authorize?${params.toString()}`;
}

/**
 * Exchange an authorization code for Cognito tokens using the /oauth2/token endpoint.
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<CognitoTokens> {
  const config = getCognitoConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
  const response = await fetch(`${config.cognitoDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error('Failed to exchange authorization code');
  }
  const data = (await response.json()) as {
    id_token: string;
    access_token: string;
    refresh_token: string;
  };
  return {
    idToken: data.id_token,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };
}

// ---- Authentication ----

/**
 * Authenticate a user against Cognito using the USER_PASSWORD_AUTH flow.
 *
 * @param email - The user's email (used as USERNAME)
 * @param password - The user's password
 * @returns The Cognito tokens on success
 * @throws Error with the Cognito error message on failure
 */
export async function authenticateUser(
  email: string,
  password: string,
): Promise<CognitoTokens> {
  const config = getCognitoConfig();

  const response = await fetch(config.cognitoEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: config.clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = (await response.json()) as CognitoErrorResponse;
    throw new Error(errorBody.message ?? 'Authentication failed');
  }

  const data = (await response.json()) as CognitoAuthResult;

  // Handle auth challenges (e.g., NEW_PASSWORD_REQUIRED, MFA)
  if (data.ChallengeName) {
    throw new Error(
      `Authentication challenge not supported: ${data.ChallengeName}`,
    );
  }

  if (!data.AuthenticationResult) {
    throw new Error('Authentication failed: no tokens returned');
  }

  return {
    idToken: data.AuthenticationResult.IdToken,
    accessToken: data.AuthenticationResult.AccessToken,
    refreshToken: data.AuthenticationResult.RefreshToken,
  };
}
