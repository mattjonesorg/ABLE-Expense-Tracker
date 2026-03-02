import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getIdToken } from '../../src/lib/auth';
import { storeTokens, clearTokens } from '../../src/lib/cognito';

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

function makeValidToken(): string {
  return makeJwt({
    email: 'test@example.com',
    sub: 'mock-sub',
    'custom:role': 'owner',
    'custom:accountId': 'acct_001',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

function makeExpiredToken(): string {
  return makeJwt({
    email: 'test@example.com',
    sub: 'mock-sub',
    'custom:role': 'owner',
    'custom:accountId': 'acct_001',
    exp: Math.floor(Date.now() / 1000) - 100,
  });
}

describe('Auth Token Management', () => {
  beforeEach(() => {
    clearTokens();
  });

  afterEach(() => {
    clearTokens();
  });

  it('getIdToken returns null when no tokens are stored', () => {
    expect(getIdToken()).toBeNull();
  });

  it('getIdToken returns the token when valid tokens are stored', () => {
    const token = makeValidToken();
    storeTokens({
      idToken: token,
      accessToken: 'mock-access',
      refreshToken: 'mock-refresh',
    });
    expect(getIdToken()).toBe(token);
  });

  it('getIdToken returns null when the stored token is expired', () => {
    storeTokens({
      idToken: makeExpiredToken(),
      accessToken: 'mock-access',
      refreshToken: 'mock-refresh',
    });
    expect(getIdToken()).toBeNull();
  });

  it('getIdToken returns null after tokens are cleared', () => {
    storeTokens({
      idToken: makeValidToken(),
      accessToken: 'mock-access',
      refreshToken: 'mock-refresh',
    });
    clearTokens();
    expect(getIdToken()).toBeNull();
  });
});
