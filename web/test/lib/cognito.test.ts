import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  authenticateUser,
  parseIdToken,
  storeTokens,
  loadTokens,
  clearTokens,
  isTokenExpired,
  type CognitoTokens,
} from '../../src/lib/cognito';

/**
 * Helper: create a base64url-encoded JWT payload.
 * A JWT is header.payload.signature — we only need to encode the payload
 * section for tests that parse the IdToken.
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

  const signature = 'mock-signature';
  return `${header}.${body}.${signature}`;
}

describe('cognito', () => {
  describe('parseIdToken', () => {
    it('extracts email, sub, role, and accountId from a valid JWT', () => {
      const token = makeJwt({
        email: 'user@example.com',
        sub: 'abc-123-def',
        'custom:role': 'owner',
        'custom:accountId': 'acct_001',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const info = parseIdToken(token);
      expect(info.email).toBe('user@example.com');
      expect(info.sub).toBe('abc-123-def');
      expect(info.role).toBe('owner');
      expect(info.accountId).toBe('acct_001');
    });

    it('uses email prefix as displayName when no custom:displayName claim', () => {
      const token = makeJwt({
        email: 'matt@example.com',
        sub: 'mock-sub-1',
        'custom:role': 'authorized_rep',
        'custom:accountId': 'acct_002',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const info = parseIdToken(token);
      expect(info.displayName).toBe('matt');
    });

    it('throws on a malformed JWT (not 3 segments)', () => {
      expect(() => parseIdToken('not-a-jwt')).toThrow();
    });

    it('throws on a JWT with invalid base64 payload', () => {
      expect(() => parseIdToken('a.!!!invalid!!!.c')).toThrow();
    });

    it('defaults role to "authorized_rep" if custom:role is missing', () => {
      const token = makeJwt({
        email: 'user@example.com',
        sub: 'mock-sub-1',
        'custom:accountId': 'acct_001',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const info = parseIdToken(token);
      expect(info.role).toBe('authorized_rep');
    });

    it('defaults accountId to empty string if custom:accountId is missing', () => {
      const token = makeJwt({
        email: 'user@example.com',
        sub: 'mock-sub-1',
        'custom:role': 'owner',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const info = parseIdToken(token);
      expect(info.accountId).toBe('');
    });
  });

  describe('isTokenExpired', () => {
    it('returns false for a token with future exp', () => {
      const token = makeJwt({
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      expect(isTokenExpired(token)).toBe(false);
    });

    it('returns true for a token with past exp', () => {
      const token = makeJwt({
        exp: Math.floor(Date.now() / 1000) - 100,
      });
      expect(isTokenExpired(token)).toBe(true);
    });

    it('returns true for a token expiring within 60 second buffer', () => {
      const token = makeJwt({
        exp: Math.floor(Date.now() / 1000) + 30, // 30s from now, within 60s buffer
      });
      expect(isTokenExpired(token)).toBe(true);
    });

    it('returns true for a malformed token', () => {
      expect(isTokenExpired('not-a-token')).toBe(true);
    });
  });

  describe('token storage (sessionStorage)', () => {
    beforeEach(() => {
      sessionStorage.clear();
    });

    afterEach(() => {
      sessionStorage.clear();
    });

    const mockTokens: CognitoTokens = {
      idToken: 'mock-id-token-value',
      accessToken: 'mock-access-token-value',
      refreshToken: 'mock-refresh-token-value',
    };

    it('storeTokens persists tokens to sessionStorage', () => {
      storeTokens(mockTokens);
      const stored = sessionStorage.getItem('able_tracker_tokens');
      expect(stored).not.toBeNull();
      const parsed: unknown = JSON.parse(stored!);
      expect(parsed).toEqual(mockTokens);
    });

    it('loadTokens retrieves previously stored tokens', () => {
      storeTokens(mockTokens);
      const loaded = loadTokens();
      expect(loaded).toEqual(mockTokens);
    });

    it('loadTokens returns null when no tokens stored', () => {
      const loaded = loadTokens();
      expect(loaded).toBeNull();
    });

    it('loadTokens returns null when sessionStorage contains invalid JSON', () => {
      sessionStorage.setItem('able_tracker_tokens', 'not-json');
      const loaded = loadTokens();
      expect(loaded).toBeNull();
    });

    it('clearTokens removes tokens from sessionStorage', () => {
      storeTokens(mockTokens);
      clearTokens();
      expect(sessionStorage.getItem('able_tracker_tokens')).toBeNull();
    });
  });

  describe('authenticateUser', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('calls Cognito endpoint with correct payload and returns tokens on success', async () => {
      const mockResponse = {
        AuthenticationResult: {
          IdToken: 'mock-id-token-response',
          AccessToken: 'mock-access-token-response',
          RefreshToken: 'mock-refresh-token-response',
          ExpiresIn: 3600,
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const tokens = await authenticateUser(
        'user@test.com',
        'mock-test-password',
      );

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      // Verify the fetch was called with correct headers and body
      const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, RequestInit];
      expect(url).toContain('cognito-idp');
      expect(url).toContain('.amazonaws.com');

      const headers = options.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/x-amz-json-1.1');
      expect(headers['X-Amz-Target']).toBe(
        'AWSCognitoIdentityProviderService.InitiateAuth',
      );

      const body: unknown = JSON.parse(options.body as string);
      expect(body).toEqual({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: expect.stringMatching(/.+/) as string,
        AuthParameters: {
          USERNAME: 'user@test.com',
          PASSWORD: 'mock-test-password', // mock test credential
        },
      });

      expect(tokens.idToken).toBe('mock-id-token-response');
      expect(tokens.accessToken).toBe('mock-access-token-response');
      expect(tokens.refreshToken).toBe('mock-refresh-token-response');
    });

    it('throws an error with Cognito message on authentication failure', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            __type: 'NotAuthorizedException',
            message: 'Incorrect username or password.',
          }),
      });

      await expect(
        authenticateUser('user@test.com', 'mock-wrong-password'),
      ).rejects.toThrow('Incorrect username or password.');
    });

    it('throws a generic error when fetch itself fails (network error)', async () => {
      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(new TypeError('fetch failed'));

      await expect(
        authenticateUser('user@test.com', 'mock-test-password'),
      ).rejects.toThrow();
    });

    it('throws when Cognito returns a challenge (e.g., NEW_PASSWORD_REQUIRED)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ChallengeName: 'NEW_PASSWORD_REQUIRED',
            Session: 'mock-session-value',
          }),
      });

      await expect(
        authenticateUser('user@test.com', 'mock-temp-password'),
      ).rejects.toThrow(/NEW_PASSWORD_REQUIRED/);
    });
  });
});
