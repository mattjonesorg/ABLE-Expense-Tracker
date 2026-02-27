import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { AuthResult, AuthContext } from '../../../src/middleware/auth.js';
import { extractAuthContext } from '../../../src/middleware/auth.js';
import type { ExpenseRepository } from '../../../src/lib/dynamo.js';
import type { Expense, AbleCategory, ApiError } from '../../../src/lib/types.js';
import { createListExpensesHandler } from '../../../src/handlers/expenses/list.js';

/**
 * Standard authenticated user context used across tests.
 */
const mockAuthContext: AuthContext = {
  userId: 'user-alice-sub',
  accountId: 'acct_01HXYZ',
  email: 'alice@example.com',
  displayName: 'Alice Smith',
  role: 'owner',
};

/**
 * Build a minimal APIGatewayProxyEventV2 for GET /expenses.
 */
function makeEvent(
  queryStringParameters?: Record<string, string>,
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /expenses',
    rawPath: '/expenses',
    rawQueryString: queryStringParameters
      ? Object.entries(queryStringParameters)
          .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
          .join('&')
      : '',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer valid-token',
    },
    queryStringParameters,
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: '/expenses',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test-agent',
      },
      requestId: 'request-id',
      routeKey: 'GET /expenses',
      stage: '$default',
      time: '15/Mar/2025:00:00:00 +0000',
      timeEpoch: 1742169600000,
    },
    isBase64Encoded: false,
  };
}

/**
 * Build a mock Expense object.
 */
function makeMockExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    expenseId: 'EXP_ULID_01',
    accountId: 'acct_01HXYZ',
    date: '2025-03-15',
    vendor: 'Walgreens',
    description: 'Medication co-pay',
    amount: 2499,
    category: 'Health, prevention & wellness',
    categoryConfidence: 'ai_confirmed',
    categoryNotes: 'Over-the-counter medication',
    receiptKey: 'receipts/acct_01HXYZ/receipt-001.jpg',
    submittedBy: 'user-alice-sub',
    paidBy: 'user-alice-sub',
    reimbursed: false,
    reimbursedAt: null,
    createdAt: '2025-03-15T10:00:00.000Z',
    updatedAt: '2025-03-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('createListExpensesHandler', () => {
  let mockRepo: {
    listExpenses: ReturnType<typeof vi.fn>;
    listExpensesByCategory: ReturnType<typeof vi.fn>;
  };
  let mockAuthenticate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRepo = {
      listExpenses: vi.fn(),
      listExpensesByCategory: vi.fn(),
    };

    mockAuthenticate = vi.fn<(event: APIGatewayProxyEventV2) => Promise<AuthResult>>();
  });

  describe('authentication', () => {
    it('returns 401 when auth middleware fails', async () => {
      mockAuthenticate.mockResolvedValue({
        success: false,
        response: {
          statusCode: 401,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ error: 'Missing Authorization header', code: 'UNAUTHORIZED' }),
        },
      });

      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent();
      delete event.headers['authorization'];

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('UNAUTHORIZED');
      expect(mockRepo.listExpenses).not.toHaveBeenCalled();
      expect(mockRepo.listExpensesByCategory).not.toHaveBeenCalled();
    });
  });

  describe('successful list — no filters', () => {
    it('returns 200 with expenses array', async () => {
      const expenses = [
        makeMockExpense({ expenseId: 'EXP_01', date: '2025-03-15' }),
        makeMockExpense({ expenseId: 'EXP_02', date: '2025-03-14' }),
      ];

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.listExpenses.mockResolvedValue(expenses);

      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body as string) as { expenses: Expense[] };
      expect(responseBody.expenses).toHaveLength(2);
      expect(responseBody.expenses[0].expenseId).toBe('EXP_01');
      expect(responseBody.expenses[1].expenseId).toBe('EXP_02');
    });

    it('returns 200 with empty array when no expenses exist', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.listExpenses.mockResolvedValue([]);

      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body as string) as { expenses: Expense[] };
      expect(responseBody.expenses).toEqual([]);
    });

    it('calls repo.listExpenses with the authenticated accountId', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.listExpenses.mockResolvedValue([]);

      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent();
      await handler(event);

      expect(mockRepo.listExpenses).toHaveBeenCalledWith('acct_01HXYZ');
    });
  });

  describe('category filter', () => {
    it('calls repo.listExpensesByCategory when category query param is provided', async () => {
      const expenses = [
        makeMockExpense({ category: 'Education' }),
      ];

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.listExpensesByCategory.mockResolvedValue(expenses);

      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent({ category: 'Education' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockRepo.listExpensesByCategory).toHaveBeenCalledWith('acct_01HXYZ', 'Education');
      expect(mockRepo.listExpenses).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid category', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });

      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent({ category: 'InvalidCategory' });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/category/i);
    });
  });

  describe('limit query parameter', () => {
    it('limits the number of returned expenses when limit is provided', async () => {
      const expenses = [
        makeMockExpense({ expenseId: 'EXP_01' }),
        makeMockExpense({ expenseId: 'EXP_02' }),
        makeMockExpense({ expenseId: 'EXP_03' }),
      ];

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.listExpenses.mockResolvedValue(expenses);

      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent({ limit: '2' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body as string) as { expenses: Expense[] };
      expect(responseBody.expenses).toHaveLength(2);
    });

    it('returns 400 for non-numeric limit', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });

      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent({ limit: 'abc' });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/limit/i);
    });

    it('returns 400 for limit <= 0', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });

      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent({ limit: '0' });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/limit/i);
    });
  });

  describe('date range filters', () => {
    it('filters expenses by startDate', async () => {
      const expenses = [
        makeMockExpense({ expenseId: 'EXP_01', date: '2025-03-15' }),
        makeMockExpense({ expenseId: 'EXP_02', date: '2025-03-10' }),
        makeMockExpense({ expenseId: 'EXP_03', date: '2025-02-28' }),
      ];

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.listExpenses.mockResolvedValue(expenses);

      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent({ startDate: '2025-03-10' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body as string) as { expenses: Expense[] };
      expect(responseBody.expenses).toHaveLength(2);
      expect(responseBody.expenses[0].expenseId).toBe('EXP_01');
      expect(responseBody.expenses[1].expenseId).toBe('EXP_02');
    });

    it('filters expenses by endDate', async () => {
      const expenses = [
        makeMockExpense({ expenseId: 'EXP_01', date: '2025-03-15' }),
        makeMockExpense({ expenseId: 'EXP_02', date: '2025-03-10' }),
        makeMockExpense({ expenseId: 'EXP_03', date: '2025-02-28' }),
      ];

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.listExpenses.mockResolvedValue(expenses);

      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent({ endDate: '2025-03-10' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body as string) as { expenses: Expense[] };
      expect(responseBody.expenses).toHaveLength(2);
      expect(responseBody.expenses[0].expenseId).toBe('EXP_02');
      expect(responseBody.expenses[1].expenseId).toBe('EXP_03');
    });

    it('filters expenses by both startDate and endDate', async () => {
      const expenses = [
        makeMockExpense({ expenseId: 'EXP_01', date: '2025-03-15' }),
        makeMockExpense({ expenseId: 'EXP_02', date: '2025-03-10' }),
        makeMockExpense({ expenseId: 'EXP_03', date: '2025-02-28' }),
      ];

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.listExpenses.mockResolvedValue(expenses);

      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent({ startDate: '2025-03-01', endDate: '2025-03-10' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body as string) as { expenses: Expense[] };
      expect(responseBody.expenses).toHaveLength(1);
      expect(responseBody.expenses[0].expenseId).toBe('EXP_02');
    });

    it('returns 400 for invalid startDate format', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });

      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent({ startDate: 'not-a-date' });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid endDate format', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });

      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent({ endDate: '03-15-2025' });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('response format', () => {
    it('sets content-type to application/json', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.listExpenses.mockResolvedValue([]);

      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.headers).toEqual(
        expect.objectContaining({ 'content-type': 'application/json' }),
      );
    });
  });

  describe('defense-in-depth: extractAuthContext with API Gateway authorizer (#63)', () => {
    /**
     * Build event with API Gateway JWT authorizer context for defense-in-depth tests.
     */
    function makeEventWithAuthorizer(
      queryStringParameters: Record<string, string> | undefined,
      claims: Record<string, string> | undefined,
    ): APIGatewayProxyEventV2 {
      const event = makeEvent(queryStringParameters);
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
      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: (event: APIGatewayProxyEventV2) => Promise.resolve(extractAuthContext(event)),
      });

      const event = makeEventWithAuthorizer(undefined, undefined);
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const responseBody = JSON.parse(result.body as string) as { message: string };
      expect(responseBody.message).toBe('Unauthorized');
      expect(mockRepo.listExpenses).not.toHaveBeenCalled();
      expect(mockRepo.listExpensesByCategory).not.toHaveBeenCalled();
    });

    it('returns 401 when JWT claims have invalid role via extractAuthContext', async () => {
      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: (event: APIGatewayProxyEventV2) => Promise.resolve(extractAuthContext(event)),
      });

      const claims = {
        sub: 'user-alice-sub',
        email: 'alice@example.com',
        'custom:accountId': 'acct_01HXYZ',
        'custom:displayName': 'Alice Smith',
        'custom:role': 'admin',
      };
      const event = makeEventWithAuthorizer(undefined, claims);
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(mockRepo.listExpenses).not.toHaveBeenCalled();
    });

    it('succeeds when valid authorizer context is present via extractAuthContext', async () => {
      mockRepo.listExpenses.mockResolvedValue([]);

      const handler = createListExpensesHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: (event: APIGatewayProxyEventV2) => Promise.resolve(extractAuthContext(event)),
      });

      const claims = {
        sub: 'user-alice-sub',
        email: 'alice@example.com',
        'custom:accountId': 'acct_01HXYZ',
        'custom:displayName': 'Alice Smith',
        'custom:role': 'owner',
      };
      const event = makeEventWithAuthorizer(undefined, claims);
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockRepo.listExpenses).toHaveBeenCalledWith('acct_01HXYZ');
    });
  });
});
