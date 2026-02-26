import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { AuthResult, AuthContext } from '../../../src/middleware/auth.js';
import type { ExpenseRepository } from '../../../src/lib/dynamo.js';
import type { Expense, ApiError } from '../../../src/lib/types.js';
import { createGetExpenseHandler } from '../../../src/handlers/expenses/get.js';

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
 * Build a minimal APIGatewayProxyEventV2 for GET /expenses/{id}.
 */
function makeEvent(expenseId?: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /expenses/{id}',
    rawPath: `/expenses/${expenseId ?? ''}`,
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer valid-token',
    },
    pathParameters: expenseId ? { id: expenseId } : undefined,
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: `/expenses/${expenseId ?? ''}`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test-agent',
      },
      requestId: 'request-id',
      routeKey: 'GET /expenses/{id}',
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

describe('createGetExpenseHandler', () => {
  let mockRepo: { getExpense: ReturnType<typeof vi.fn> };
  let mockAuthenticate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRepo = {
      getExpense: vi.fn(),
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

      const handler = createGetExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('EXP_ULID_01');
      delete event.headers['authorization'];

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('UNAUTHORIZED');
      expect(mockRepo.getExpense).not.toHaveBeenCalled();
    });
  });

  describe('successful get', () => {
    it('returns 200 with the expense when found', async () => {
      const expense = makeMockExpense();

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.getExpense.mockResolvedValue(expense);

      const handler = createGetExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('EXP_ULID_01');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body as string) as Expense;
      expect(responseBody.expenseId).toBe('EXP_ULID_01');
      expect(responseBody.vendor).toBe('Walgreens');
      expect(responseBody.amount).toBe(2499);
    });

    it('calls repo.getExpense with accountId and expenseId', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.getExpense.mockResolvedValue(makeMockExpense());

      const handler = createGetExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('EXP_ULID_01');
      await handler(event);

      expect(mockRepo.getExpense).toHaveBeenCalledWith('acct_01HXYZ', 'EXP_ULID_01');
    });
  });

  describe('not found', () => {
    it('returns 404 when expense does not exist', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.getExpense.mockResolvedValue(null);

      const handler = createGetExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('nonexistent-id');
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('NOT_FOUND');
      expect(responseBody.error).toMatch(/expense/i);
    });
  });

  describe('missing path parameter', () => {
    it('returns 400 when id path parameter is missing', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });

      const handler = createGetExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent();
      // Explicitly remove pathParameters
      event.pathParameters = undefined;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/id/i);
      expect(mockRepo.getExpense).not.toHaveBeenCalled();
    });

    it('returns 400 when id path parameter is empty string', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });

      const handler = createGetExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('');
      event.pathParameters = { id: '' };

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(mockRepo.getExpense).not.toHaveBeenCalled();
    });
  });

  describe('response format', () => {
    it('sets content-type to application/json', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.getExpense.mockResolvedValue(makeMockExpense());

      const handler = createGetExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('EXP_ULID_01');
      const result = await handler(event);

      expect(result.headers).toEqual(
        expect.objectContaining({ 'content-type': 'application/json' }),
      );
    });
  });
});
