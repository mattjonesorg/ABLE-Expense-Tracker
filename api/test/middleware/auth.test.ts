import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import type { TokenVerifier, TokenClaims, AuthResult } from '../../src/middleware/auth.js';

/**
 * Helper to build a minimal APIGatewayProxyEventV2 with optional headers.
 */
function makeEvent(headers: Record<string, string> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /test',
    rawPath: '/test',
    rawQueryString: '',
    headers,
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: '/test',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test-agent',
      },
      requestId: 'request-id',
      routeKey: 'GET /test',
      stage: '$default',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 1735689600000,
    },
    isBase64Encoded: false,
    body: undefined,
  };
}

/**
 * Standard valid token claims used across tests.
 */
const validClaims: TokenClaims = {
  sub: 'cognito-sub-12345',
  email: 'alice@example.com',
  'custom:accountId': 'acct_01HXYZ',
  'custom:displayName': 'Alice Smith',
  'custom:role': 'owner',
};

describe('createAuthMiddleware', () => {
  describe('successful authentication', () => {
    it('accepts a valid token and extracts user info from claims', async () => {
      const verifier = vi.fn<TokenVerifier>().mockResolvedValue(validClaims);
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Bearer valid-token-123' });
      const result = await middleware(event);

      expect(result.success).toBe(true);
      expect(verifier).toHaveBeenCalledWith('valid-token-123');

      const ctx = (result as Extract<AuthResult, { success: true }>).context;
      expect(ctx).toBeDefined();
    });

    it('extracts accountId, userId, email, displayName, and role from token claims', async () => {
      const verifier = vi.fn<TokenVerifier>().mockResolvedValue(validClaims);
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Bearer valid-token-123' });
      const result = await middleware(event);

      expect(result.success).toBe(true);
      const ctx = (result as Extract<AuthResult, { success: true }>).context;

      expect(ctx.userId).toBe('cognito-sub-12345');
      expect(ctx.accountId).toBe('acct_01HXYZ');
      expect(ctx.email).toBe('alice@example.com');
      expect(ctx.displayName).toBe('Alice Smith');
      expect(ctx.role).toBe('owner');
    });

    it('handles authorized_rep role correctly', async () => {
      const repClaims: TokenClaims = {
        ...validClaims,
        'custom:role': 'authorized_rep',
      };
      const verifier = vi.fn<TokenVerifier>().mockResolvedValue(repClaims);
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Bearer rep-token' });
      const result = await middleware(event);

      expect(result.success).toBe(true);
      const ctx = (result as Extract<AuthResult, { success: true }>).context;
      expect(ctx.role).toBe('authorized_rep');
    });
  });

  describe('missing Authorization header', () => {
    it('rejects with 401 when Authorization header is missing', async () => {
      const verifier = vi.fn<TokenVerifier>();
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({});
      const result = await middleware(event);

      expect(result.success).toBe(false);
      expect(verifier).not.toHaveBeenCalled();

      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);
    });

    it('returns proper 401 JSON response format for missing header', async () => {
      const verifier = vi.fn<TokenVerifier>();
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({});
      const result = await middleware(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body as string) as { error: string; code: string };
      expect(body.error).toBe('Missing Authorization header');
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('malformed Authorization header', () => {
    it('rejects when Authorization header has no "Bearer " prefix', async () => {
      const verifier = vi.fn<TokenVerifier>();
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Basic abc123' });
      const result = await middleware(event);

      expect(result.success).toBe(false);
      expect(verifier).not.toHaveBeenCalled();

      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body as string) as { error: string; code: string };
      expect(body.error).toBe('Invalid Authorization header format');
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('rejects when Authorization header is "Bearer " with no token', async () => {
      const verifier = vi.fn<TokenVerifier>();
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Bearer ' });
      const result = await middleware(event);

      expect(result.success).toBe(false);
      expect(verifier).not.toHaveBeenCalled();

      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body as string) as { error: string; code: string };
      expect(body.error).toBe('Invalid Authorization header format');
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('rejects when Authorization header is just a raw token', async () => {
      const verifier = vi.fn<TokenVerifier>();
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'some-raw-token' });
      const result = await middleware(event);

      expect(result.success).toBe(false);
      expect(verifier).not.toHaveBeenCalled();
    });
  });

  describe('expired token', () => {
    it('rejects with 401 when verifier throws for expired token', async () => {
      const verifier = vi.fn<TokenVerifier>().mockRejectedValue(new Error('Token expired'));
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Bearer expired-token' });
      const result = await middleware(event);

      expect(result.success).toBe(false);
      expect(verifier).toHaveBeenCalledWith('expired-token');

      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body as string) as { error: string; code: string };
      expect(body.error).toBe('Token expired');
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('invalid signature', () => {
    it('rejects with 401 when verifier throws for invalid signature', async () => {
      const verifier = vi.fn<TokenVerifier>().mockRejectedValue(new Error('Invalid token signature'));
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Bearer bad-signature-token' });
      const result = await middleware(event);

      expect(result.success).toBe(false);
      expect(verifier).toHaveBeenCalledWith('bad-signature-token');

      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body as string) as { error: string; code: string };
      expect(body.error).toBe('Invalid token signature');
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('401 response format', () => {
    it('always includes Content-Type application/json header in error responses', async () => {
      const verifier = vi.fn<TokenVerifier>();
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({});
      const result = await middleware(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.headers).toBeDefined();
      expect(response.headers?.['content-type']).toBe('application/json');
    });

    it('returns JSON body with error string and code "UNAUTHORIZED"', async () => {
      const verifier = vi.fn<TokenVerifier>().mockRejectedValue(new Error('Some verification error'));
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Bearer some-token' });
      const result = await middleware(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      const body = JSON.parse(response.body as string) as { error: string; code: string };

      expect(typeof body.error).toBe('string');
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('provides a generic error message when verifier throws a non-Error', async () => {
      const verifier = vi.fn<TokenVerifier>().mockRejectedValue('string-error');
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Bearer some-token' });
      const result = await middleware(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      const body = JSON.parse(response.body as string) as { error: string; code: string };

      expect(body.error).toBe('Token verification failed');
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('case-insensitive header handling', () => {
    it('handles lowercase authorization header', async () => {
      const verifier = vi.fn<TokenVerifier>().mockResolvedValue(validClaims);
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Bearer valid-token' });
      const result = await middleware(event);

      expect(result.success).toBe(true);
    });

    it('handles mixed-case Authorization header', async () => {
      const verifier = vi.fn<TokenVerifier>().mockResolvedValue(validClaims);
      const middleware = createAuthMiddleware(verifier);

      // API Gateway v2 lowercases headers, but we should handle mixed case too
      const event = makeEvent({ Authorization: 'Bearer valid-token' });
      const result = await middleware(event);

      expect(result.success).toBe(true);
    });
  });
});
