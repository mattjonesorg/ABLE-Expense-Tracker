import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createAuthMiddleware, extractAuthContext } from '../../src/middleware/auth.js';
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
      // #43: Generic error message
      expect(body.error).toBe('Unauthorized');
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
      // #43: Generic error message
      expect(body.error).toBe('Unauthorized');
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
      // #43: Generic error message
      expect(body.error).toBe('Unauthorized');
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
      // #43: Generic error message — must NOT leak "Token expired"
      expect(body.error).toBe('Unauthorized');
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
      // #43: Generic error message — must NOT leak "Invalid token signature"
      expect(body.error).toBe('Unauthorized');
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('generic auth error messages (#43)', () => {
    it('returns generic "Unauthorized" for all token verification failures', async () => {
      const verifier = vi.fn<TokenVerifier>().mockRejectedValue(new Error('jwt malformed: unexpected payload'));
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Bearer bad-token' });
      const result = await middleware(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body as string) as { error: string; code: string };
      expect(body.error).toBe('Unauthorized');
      expect(body.error).not.toContain('jwt');
      expect(body.error).not.toContain('malformed');
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('returns generic "Unauthorized" even when verifier throws non-Error', async () => {
      const verifier = vi.fn<TokenVerifier>().mockRejectedValue('string-error');
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Bearer some-token' });
      const result = await middleware(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      const body = JSON.parse(response.body as string) as { error: string; code: string };

      expect(body.error).toBe('Unauthorized');
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('returns generic "Forbidden" for invalid role (not specific claim details)', async () => {
      const claimsWithBadRole: TokenClaims = {
        ...validClaims,
        'custom:role': 'admin',
      };
      const verifier = vi.fn<TokenVerifier>().mockResolvedValue(claimsWithBadRole);
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Bearer valid-token' });
      const result = await middleware(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body as string) as { error: string; code: string };
      expect(body.error).toBe('Forbidden');
      expect(body.error).not.toContain('role');
      expect(body.error).not.toContain('claim');
      expect(body.code).toBe('FORBIDDEN');
    });

    it('returns generic "Forbidden" for missing accountId (not specific claim details)', async () => {
      const claimsWithoutAccountId: TokenClaims = {
        ...validClaims,
        'custom:accountId': '',
      };
      const verifier = vi.fn<TokenVerifier>().mockResolvedValue(claimsWithoutAccountId);
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Bearer valid-token' });
      const result = await middleware(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body as string) as { error: string; code: string };
      expect(body.error).toBe('Forbidden');
      expect(body.error).not.toContain('accountId');
      expect(body.error).not.toContain('claim');
      expect(body.code).toBe('FORBIDDEN');
    });

    it('returns generic "Unauthorized" for missing Authorization header', async () => {
      const verifier = vi.fn<TokenVerifier>();
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({});
      const result = await middleware(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body as string) as { error: string; code: string };
      expect(body.error).toBe('Unauthorized');
      expect(body.error).not.toContain('header');
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('returns generic "Unauthorized" for malformed Authorization header', async () => {
      const verifier = vi.fn<TokenVerifier>();
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Basic abc123' });
      const result = await middleware(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body as string) as { error: string; code: string };
      expect(body.error).toBe('Unauthorized');
      expect(body.error).not.toContain('format');
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

      // #43: All auth errors now use generic "Unauthorized"
      expect(body.error).toBe('Unauthorized');
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('missing role claim', () => {
    it('returns 403 when custom:role claim is missing', async () => {
      const claimsWithoutRole: TokenClaims = {
        ...validClaims,
        'custom:role': '',
      };
      const verifier = vi.fn<TokenVerifier>().mockResolvedValue(claimsWithoutRole);
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Bearer valid-token' });
      const result = await middleware(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body as string) as { error: string; code: string };
      expect(body.code).toBe('FORBIDDEN');
    });

    it('returns 403 when custom:role claim has an invalid value', async () => {
      const claimsWithBadRole: TokenClaims = {
        ...validClaims,
        'custom:role': 'admin',
      };
      const verifier = vi.fn<TokenVerifier>().mockResolvedValue(claimsWithBadRole);
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Bearer valid-token' });
      const result = await middleware(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body as string) as { error: string; code: string };
      // #43: Generic error message — must NOT leak "Invalid role claim"
      expect(body.error).toBe('Forbidden');
      expect(body.code).toBe('FORBIDDEN');
    });
  });

  describe('missing accountId claim', () => {
    it('returns 403 when custom:accountId claim is missing', async () => {
      const claimsWithoutAccountId: TokenClaims = {
        ...validClaims,
        'custom:accountId': '',
      };
      const verifier = vi.fn<TokenVerifier>().mockResolvedValue(claimsWithoutAccountId);
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Bearer valid-token' });
      const result = await middleware(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body as string) as { error: string; code: string };
      // #43: Generic error message — must NOT leak "Missing accountId claim"
      expect(body.error).toBe('Forbidden');
      expect(body.code).toBe('FORBIDDEN');
    });
  });

  describe('role values are preserved in auth context', () => {
    it('preserves owner role in auth result', async () => {
      const verifier = vi.fn<TokenVerifier>().mockResolvedValue(validClaims);
      const middleware = createAuthMiddleware(verifier);

      const event = makeEvent({ authorization: 'Bearer valid-token' });
      const result = await middleware(event);

      expect(result.success).toBe(true);
      const ctx = (result as Extract<AuthResult, { success: true }>).context;
      expect(ctx.role).toBe('owner');
    });

    it('preserves authorized_rep role in auth result', async () => {
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

/**
 * Helper to build a minimal APIGatewayProxyEventV2 with API Gateway JWT authorizer context.
 */
function makeEventWithAuthorizer(
  claims: Record<string, string> | undefined,
): APIGatewayProxyEventV2 {
  const event: APIGatewayProxyEventV2 = {
    version: '2.0',
    routeKey: 'GET /test',
    rawPath: '/test',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      authorizer: claims
        ? { jwt: { claims, scopes: [] } }
        : undefined,
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

  // When claims is undefined, remove the authorizer entirely
  if (!claims) {
    // Force-cast to remove authorizer for testing the missing case
    (event.requestContext as Record<string, unknown>)['authorizer'] = undefined;
  }

  return event;
}

/**
 * Standard valid JWT claims from API Gateway authorizer.
 */
const validAuthorizerClaims: Record<string, string> = {
  sub: 'cognito-sub-12345',
  email: 'alice@example.com',
  'custom:accountId': 'acct_01HXYZ',
  'custom:displayName': 'Alice Smith',
  'custom:role': 'owner',
};

describe('extractAuthContext', () => {
  describe('successful extraction', () => {
    it('extracts auth context from valid API Gateway JWT authorizer claims', () => {
      const event = makeEventWithAuthorizer(validAuthorizerClaims);
      const result = extractAuthContext(event);

      expect(result.success).toBe(true);
      const ctx = (result as Extract<AuthResult, { success: true }>).context;
      expect(ctx.userId).toBe('cognito-sub-12345');
      expect(ctx.accountId).toBe('acct_01HXYZ');
      expect(ctx.email).toBe('alice@example.com');
      expect(ctx.displayName).toBe('Alice Smith');
      expect(ctx.role).toBe('owner');
    });

    it('handles authorized_rep role correctly', () => {
      const claims = {
        ...validAuthorizerClaims,
        'custom:role': 'authorized_rep',
      };
      const event = makeEventWithAuthorizer(claims);
      const result = extractAuthContext(event);

      expect(result.success).toBe(true);
      const ctx = (result as Extract<AuthResult, { success: true }>).context;
      expect(ctx.role).toBe('authorized_rep');
    });
  });

  describe('missing authorizer context', () => {
    it('returns 401 when event.requestContext.authorizer is undefined', () => {
      const event = makeEventWithAuthorizer(undefined);
      const result = extractAuthContext(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body as string) as { message: string };
      expect(body.message).toBe('Unauthorized');
    });

    it('returns 401 when event.requestContext.authorizer.jwt is missing', () => {
      const event: APIGatewayProxyEventV2 = {
        version: '2.0',
        routeKey: 'GET /test',
        rawPath: '/test',
        rawQueryString: '',
        headers: {},
        requestContext: {
          accountId: '123456789012',
          apiId: 'api-id',
          authorizer: {} as APIGatewayProxyEventV2['requestContext']['authorizer'],
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
      const result = extractAuthContext(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);
    });

    it('returns 401 when event.requestContext.authorizer.jwt.claims is empty', () => {
      const event = makeEventWithAuthorizer({});
      const result = extractAuthContext(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);
    });
  });

  describe('missing required claims', () => {
    it('returns 401 when sub claim is missing', () => {
      const claims = { ...validAuthorizerClaims };
      delete claims['sub'];
      const event = makeEventWithAuthorizer(claims);
      const result = extractAuthContext(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body as string) as { message: string };
      expect(body.message).toBe('Unauthorized');
    });

    it('returns 401 when email claim is missing', () => {
      const claims = { ...validAuthorizerClaims };
      delete claims['email'];
      const event = makeEventWithAuthorizer(claims);
      const result = extractAuthContext(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);
    });

    it('returns 401 when custom:accountId claim is missing', () => {
      const claims = { ...validAuthorizerClaims };
      delete claims['custom:accountId'];
      const event = makeEventWithAuthorizer(claims);
      const result = extractAuthContext(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);
    });

    it('returns 401 when custom:role claim is missing', () => {
      const claims = { ...validAuthorizerClaims };
      delete claims['custom:role'];
      const event = makeEventWithAuthorizer(claims);
      const result = extractAuthContext(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);
    });

    it('returns 401 when custom:accountId claim is empty string', () => {
      const claims = { ...validAuthorizerClaims, 'custom:accountId': '' };
      const event = makeEventWithAuthorizer(claims);
      const result = extractAuthContext(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);
    });

    it('returns 401 when sub claim is empty string', () => {
      const claims = { ...validAuthorizerClaims, sub: '' };
      const event = makeEventWithAuthorizer(claims);
      const result = extractAuthContext(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);
    });
  });

  describe('invalid role claim', () => {
    it('returns 401 when custom:role has an invalid value', () => {
      const claims = { ...validAuthorizerClaims, 'custom:role': 'admin' };
      const event = makeEventWithAuthorizer(claims);
      const result = extractAuthContext(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);
    });

    it('returns 401 when custom:role is empty string', () => {
      const claims = { ...validAuthorizerClaims, 'custom:role': '' };
      const event = makeEventWithAuthorizer(claims);
      const result = extractAuthContext(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.statusCode).toBe(401);
    });
  });

  describe('response format', () => {
    it('returns JSON response with content-type header on 401', () => {
      const event = makeEventWithAuthorizer(undefined);
      const result = extractAuthContext(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      expect(response.headers).toBeDefined();
      expect(response.headers?.['content-type']).toBe('application/json');
    });

    it('returns { message: "Unauthorized" } body on 401', () => {
      const event = makeEventWithAuthorizer(undefined);
      const result = extractAuthContext(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      const body = JSON.parse(response.body as string) as { message: string };
      expect(body.message).toBe('Unauthorized');
    });

    it('does not leak claim details in error responses', () => {
      const claims = { ...validAuthorizerClaims };
      delete claims['custom:accountId'];
      const event = makeEventWithAuthorizer(claims);
      const result = extractAuthContext(event);

      expect(result.success).toBe(false);
      const response = (result as Extract<AuthResult, { success: false }>).response;
      const body = JSON.parse(response.body as string) as { message: string };
      expect(body.message).toBe('Unauthorized');
      expect(body.message).not.toContain('accountId');
      expect(body.message).not.toContain('claim');
    });
  });
});
