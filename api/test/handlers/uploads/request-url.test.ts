import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { AuthResult } from '../../../src/middleware/auth.js';
import type { AuthContext } from '../../../src/middleware/auth.js';
import { extractAuthContext } from '../../../src/middleware/auth.js';
import { createUploadUrlHandler } from '../../../src/handlers/uploads/request-url.js';
import type { UploadHandlerDeps } from '../../../src/handlers/uploads/request-url.js';

/**
 * Standard authenticated user context for tests.
 */
const validAuthContext: AuthContext = {
  userId: 'cognito-sub-12345',
  accountId: 'acct_01HXYZ',
  email: 'alice@example.com',
  displayName: 'Alice Smith',
  role: 'owner',
};

/**
 * Helper to build a minimal APIGatewayProxyEventV2.
 */
function makeEvent(
  overrides: {
    body?: string;
    headers?: Record<string, string>;
  } = {},
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /uploads/request-url',
    rawPath: '/uploads/request-url',
    rawQueryString: '',
    headers: overrides.headers ?? { authorization: 'Bearer valid-token' },
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/uploads/request-url',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test-agent',
      },
      requestId: 'request-id',
      routeKey: 'POST /uploads/request-url',
      stage: '$default',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 1735689600000,
    },
    isBase64Encoded: false,
    body: overrides.body ?? undefined,
  };
}

/**
 * Create default dependencies with an authenticated user and fake presigner.
 */
function makeDeps(overrides: Partial<UploadHandlerDeps> = {}): UploadHandlerDeps {
  const successAuth: AuthResult = { success: true, context: validAuthContext };

  return {
    authenticate: overrides.authenticate ?? vi.fn<(event: APIGatewayProxyEventV2) => Promise<AuthResult>>().mockResolvedValue(successAuth),
    getSignedUrl: overrides.getSignedUrl ?? vi.fn<(bucketName: string, key: string, contentType: string, expiresIn: number) => Promise<string>>().mockResolvedValue('https://s3.amazonaws.com/test-bucket/presigned-url'),
    bucketName: overrides.bucketName ?? 'test-receipt-bucket',
  };
}

describe('createUploadUrlHandler', () => {
  describe('successful presigned URL generation', () => {
    it('returns 200 with presigned URL and S3 key', async () => {
      const deps = makeDeps();
      const handler = createUploadUrlHandler(deps);

      const event = makeEvent({
        body: JSON.stringify({ contentType: 'image/jpeg' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body as string) as { uploadUrl: string; key: string };
      expect(body.uploadUrl).toBe('https://s3.amazonaws.com/test-bucket/presigned-url');
      expect(body.key).toBeDefined();
      expect(typeof body.key).toBe('string');
    });

    it('scopes S3 key to user account: receipts/${accountId}/${ulid}.${ext}', async () => {
      const deps = makeDeps();
      const handler = createUploadUrlHandler(deps);

      const event = makeEvent({
        body: JSON.stringify({ contentType: 'image/jpeg' }),
      });
      const result = await handler(event);
      const body = JSON.parse(result.body as string) as { uploadUrl: string; key: string };

      // Key should start with receipts/<accountId>/
      expect(body.key).toMatch(/^receipts\/acct_01HXYZ\/.+\.jpg$/);
    });

    it('returns the S3 key in the response body for associating with expense later', async () => {
      const deps = makeDeps();
      const handler = createUploadUrlHandler(deps);

      const event = makeEvent({
        body: JSON.stringify({ contentType: 'image/png' }),
      });
      const result = await handler(event);
      const body = JSON.parse(result.body as string) as { uploadUrl: string; key: string };

      // key should be a non-empty string in the expected format
      expect(body.key).toBeTruthy();
      expect(body.key).toMatch(/^receipts\/acct_01HXYZ\/.+\.png$/);
    });
  });

  describe('content type validation', () => {
    it('accepts image/jpeg content type', async () => {
      const deps = makeDeps();
      const handler = createUploadUrlHandler(deps);

      const event = makeEvent({
        body: JSON.stringify({ contentType: 'image/jpeg' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string) as { key: string };
      expect(body.key).toMatch(/\.jpg$/);
    });

    it('accepts image/png content type', async () => {
      const deps = makeDeps();
      const handler = createUploadUrlHandler(deps);

      const event = makeEvent({
        body: JSON.stringify({ contentType: 'image/png' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string) as { key: string };
      expect(body.key).toMatch(/\.png$/);
    });

    it('accepts image/webp content type', async () => {
      const deps = makeDeps();
      const handler = createUploadUrlHandler(deps);

      const event = makeEvent({
        body: JSON.stringify({ contentType: 'image/webp' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string) as { key: string };
      expect(body.key).toMatch(/\.webp$/);
    });

    it('rejects non-image content types with 400', async () => {
      const deps = makeDeps();
      const handler = createUploadUrlHandler(deps);

      const event = makeEvent({
        body: JSON.stringify({ contentType: 'application/pdf' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body as string) as { error: string; code: string };
      expect(body.error).toContain('content type');
      expect(body.code).toBe('INVALID_CONTENT_TYPE');
    });

    it('handles missing content-type in request with 400', async () => {
      const deps = makeDeps();
      const handler = createUploadUrlHandler(deps);

      const event = makeEvent({
        body: JSON.stringify({}),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body as string) as { error: string; code: string };
      expect(body.error).toContain('contentType');
      expect(body.code).toBe('MISSING_CONTENT_TYPE');
    });
  });

  describe('authentication', () => {
    it('returns 401 when auth fails', async () => {
      const failedAuth: AuthResult = {
        success: false,
        response: {
          statusCode: 401,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHORIZED' }),
        },
      };
      const deps = makeDeps({
        authenticate: vi.fn<(event: APIGatewayProxyEventV2) => Promise<AuthResult>>().mockResolvedValue(failedAuth),
      });
      const handler = createUploadUrlHandler(deps);

      const event = makeEvent({
        body: JSON.stringify({ contentType: 'image/jpeg' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body as string) as { error: string; code: string };
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('presigner configuration', () => {
    it('passes TTL of at most 900 seconds (15 min) to the presigner', async () => {
      const mockGetSignedUrl = vi.fn<(bucketName: string, key: string, contentType: string, expiresIn: number) => Promise<string>>().mockResolvedValue('https://s3.amazonaws.com/test-bucket/presigned-url');
      const deps = makeDeps({ getSignedUrl: mockGetSignedUrl });
      const handler = createUploadUrlHandler(deps);

      const event = makeEvent({
        body: JSON.stringify({ contentType: 'image/jpeg' }),
      });
      await handler(event);

      expect(mockGetSignedUrl).toHaveBeenCalledOnce();
      const callArgs = mockGetSignedUrl.mock.calls[0];
      // callArgs: [bucketName, key, contentType, expiresIn]
      const expiresIn = callArgs[3];
      expect(expiresIn).toBeLessThanOrEqual(900);
      expect(expiresIn).toBeGreaterThan(0);
    });

    it('passes the correct bucket name to the presigner', async () => {
      const mockGetSignedUrl = vi.fn<(bucketName: string, key: string, contentType: string, expiresIn: number) => Promise<string>>().mockResolvedValue('https://s3.amazonaws.com/test-bucket/presigned-url');
      const deps = makeDeps({
        getSignedUrl: mockGetSignedUrl,
        bucketName: 'my-custom-bucket',
      });
      const handler = createUploadUrlHandler(deps);

      const event = makeEvent({
        body: JSON.stringify({ contentType: 'image/jpeg' }),
      });
      await handler(event);

      expect(mockGetSignedUrl).toHaveBeenCalledOnce();
      const callArgs = mockGetSignedUrl.mock.calls[0];
      expect(callArgs[0]).toBe('my-custom-bucket');
    });

    it('passes the correct content type to the presigner', async () => {
      const mockGetSignedUrl = vi.fn<(bucketName: string, key: string, contentType: string, expiresIn: number) => Promise<string>>().mockResolvedValue('https://s3.amazonaws.com/test-bucket/presigned-url');
      const deps = makeDeps({ getSignedUrl: mockGetSignedUrl });
      const handler = createUploadUrlHandler(deps);

      const event = makeEvent({
        body: JSON.stringify({ contentType: 'image/png' }),
      });
      await handler(event);

      expect(mockGetSignedUrl).toHaveBeenCalledOnce();
      const callArgs = mockGetSignedUrl.mock.calls[0];
      expect(callArgs[2]).toBe('image/png');
    });
  });

  describe('defense-in-depth: extractAuthContext with API Gateway authorizer (#63)', () => {
    /**
     * Build event with API Gateway JWT authorizer context for defense-in-depth tests.
     */
    function makeEventWithAuthorizer(
      body: string,
      claims: Record<string, string> | undefined,
    ): APIGatewayProxyEventV2 {
      const event = makeEvent({ body });
      if (claims) {
        (event.requestContext as Record<string, unknown>)['authorizer'] = {
          jwt: { claims, scopes: [] },
        };
      } else {
        (event.requestContext as Record<string, unknown>)['authorizer'] = undefined;
      }
      return event;
    }

    it('returns 401 when authorizer context is missing and extractAuthContext is used', async () => {
      const deps = makeDeps({
        authenticate: (event: APIGatewayProxyEventV2) => Promise.resolve(extractAuthContext(event)),
      });
      const handler = createUploadUrlHandler(deps);

      const event = makeEventWithAuthorizer(
        JSON.stringify({ contentType: 'image/jpeg' }),
        undefined,
      );
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body as string) as { message: string };
      expect(body.message).toBe('Unauthorized');
    });

    it('returns 401 when JWT claims have no required fields via extractAuthContext', async () => {
      const deps = makeDeps({
        authenticate: (event: APIGatewayProxyEventV2) => Promise.resolve(extractAuthContext(event)),
      });
      const handler = createUploadUrlHandler(deps);

      const event = makeEventWithAuthorizer(
        JSON.stringify({ contentType: 'image/jpeg' }),
        { sub: 'some-sub' }, // missing email, accountId, role
      );
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
    });

    it('succeeds when valid authorizer context is present via extractAuthContext', async () => {
      const deps = makeDeps({
        authenticate: (event: APIGatewayProxyEventV2) => Promise.resolve(extractAuthContext(event)),
      });
      const handler = createUploadUrlHandler(deps);

      const claims = {
        sub: 'cognito-sub-12345',
        email: 'alice@example.com',
        'custom:accountId': 'acct_01HXYZ',
        'custom:displayName': 'Alice Smith',
        'custom:role': 'owner',
      };
      const event = makeEventWithAuthorizer(
        JSON.stringify({ contentType: 'image/jpeg' }),
        claims,
      );
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });
});
