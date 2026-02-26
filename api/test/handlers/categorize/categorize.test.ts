import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { CategoryResult } from '../../../src/lib/types.js';
import type { AuthResult } from '../../../src/middleware/auth.js';
import { createCategorizeHandler } from '../../../src/handlers/categorize/categorize.js';

/**
 * Minimal APIGatewayProxyEventV2 factory for handler tests.
 */
function makeEvent(overrides: {
  body?: string | null;
  headers?: Record<string, string>;
}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /categorize',
    rawPath: '/categorize',
    rawQueryString: '',
    headers: overrides.headers ?? { authorization: 'Bearer valid-token' },
    requestContext: {
      accountId: '123456789',
      apiId: 'api-id',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/categorize',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test-agent',
      },
      requestId: 'request-id',
      routeKey: 'POST /categorize',
      stage: '$default',
      time: '2026-01-01T00:00:00Z',
      timeEpoch: 0,
    },
    body: overrides.body ?? null,
    isBase64Encoded: false,
  };
}

const successfulAuth: AuthResult = {
  success: true,
  context: {
    userId: 'user-123',
    accountId: 'acct-456',
    email: 'test@example.com',
    displayName: 'Test User',
    role: 'owner',
  },
};

const failedAuth: AuthResult = {
  success: false,
  response: {
    statusCode: 401,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: 'Missing Authorization header', code: 'UNAUTHORIZED' }),
  },
};

const mockCategoryResult: CategoryResult = {
  suggestedCategory: 'Education',
  confidence: 'high',
  reasoning: 'Tuition is a qualified education expense under ABLE.',
  followUpQuestion: null,
};

describe('createCategorizeHandler', () => {
  it('returns 200 with categorization result', async () => {
    const authenticate = vi.fn().mockResolvedValue(successfulAuth);
    const categorize = vi.fn().mockResolvedValue(mockCategoryResult);
    const handler = createCategorizeHandler({ categorize, authenticate });

    const event = makeEvent({
      body: JSON.stringify({
        vendor: 'University Store',
        description: 'Textbooks for fall semester',
        amount: 15000,
      }),
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string) as CategoryResult;
    expect(body.suggestedCategory).toBe('Education');
    expect(body.confidence).toBe('high');
    expect(categorize).toHaveBeenCalledWith({
      vendor: 'University Store',
      description: 'Textbooks for fall semester',
      amount: 15000,
    });
  });

  it('returns 401 without valid auth', async () => {
    const authenticate = vi.fn().mockResolvedValue(failedAuth);
    const categorize = vi.fn();
    const handler = createCategorizeHandler({ categorize, authenticate });

    const event = makeEvent({ body: JSON.stringify({ vendor: 'X', description: 'Y', amount: 100 }) });
    const response = await handler(event);

    expect(response.statusCode).toBe(401);
    expect(categorize).not.toHaveBeenCalled();
  });

  it('returns 400 if vendor or description missing', async () => {
    const authenticate = vi.fn().mockResolvedValue(successfulAuth);
    const categorize = vi.fn();
    const handler = createCategorizeHandler({ categorize, authenticate });

    // Missing vendor
    const event1 = makeEvent({
      body: JSON.stringify({ description: 'Something', amount: 100 }),
    });
    const response1 = await handler(event1);
    expect(response1.statusCode).toBe(400);

    // Missing description
    const event2 = makeEvent({
      body: JSON.stringify({ vendor: 'SomeVendor', amount: 100 }),
    });
    const response2 = await handler(event2);
    expect(response2.statusCode).toBe(400);

    // Both missing (no body)
    const event3 = makeEvent({ body: null });
    const response3 = await handler(event3);
    expect(response3.statusCode).toBe(400);

    expect(categorize).not.toHaveBeenCalled();
  });

  it('returns 200 with null result if categorizer returns null (graceful degradation)', async () => {
    const authenticate = vi.fn().mockResolvedValue(successfulAuth);
    const categorize = vi.fn().mockResolvedValue(null);
    const handler = createCategorizeHandler({ categorize, authenticate });

    const event = makeEvent({
      body: JSON.stringify({
        vendor: 'Unknown Shop',
        description: 'Mystery item',
        amount: 999,
      }),
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string) as { result: null };
    expect(body.result).toBeNull();
  });
});
