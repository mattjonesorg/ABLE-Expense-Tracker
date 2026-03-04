import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { AuthResult, AuthContext } from '../../../src/middleware/auth.js';
import type { ExpenseRepository } from '../../../src/lib/dynamo.js';
import type { Expense, ApiError } from '../../../src/lib/types.js';
import { createReimburseExpenseHandler } from '../../../src/handlers/expenses/reimburse.js';

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
 * Build a minimal APIGatewayProxyEventV2 for PUT /expenses/{id}/reimburse.
 */
function makeEvent(
  expenseId: string,
  body: string | undefined,
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'PUT /expenses/{id}/reimburse',
    rawPath: `/expenses/${expenseId}/reimburse`,
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer valid-token',
    },
    pathParameters: { id: expenseId },
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'PUT',
        path: `/expenses/${expenseId}/reimburse`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test-agent',
      },
      requestId: 'request-id',
      routeKey: 'PUT /expenses/{id}/reimburse',
      stage: '$default',
      time: '15/Mar/2025:00:00:00 +0000',
      timeEpoch: 1742169600000,
    },
    isBase64Encoded: false,
    body,
  };
}

/**
 * Build a mock unreimbursed expense for testing.
 */
function makeUnreimbursedExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    expenseId: 'EXP_01HTEST',
    accountId: 'acct_01HXYZ',
    date: '2025-03-10',
    vendor: 'Walgreens',
    description: 'Medication co-pay',
    amount: 2499,
    category: 'Health, prevention & wellness',
    categoryConfidence: 'ai_confirmed',
    categoryNotes: 'Over-the-counter medication',
    receiptKey: 'receipts/acct_01HXYZ/receipt-001.jpg',
    submittedBy: 'user-alice-sub',
    paidBy: 'user-bob-sub',
    reimbursed: false,
    reimbursedAt: null,
    createdAt: '2025-03-10T10:00:00.000Z',
    updatedAt: '2025-03-10T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * Build a mock reimbursed expense (after markReimbursed).
 */
function makeReimbursedExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    ...makeUnreimbursedExpense(),
    reimbursed: true,
    reimbursedAt: '2025-03-15T10:00:00.000Z',
    updatedAt: '2025-03-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('createReimburseExpenseHandler', () => {
  let mockRepo: {
    getExpense: ReturnType<typeof vi.fn>;
    markReimbursed: ReturnType<typeof vi.fn>;
  };
  let mockAuthenticate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'));

    mockRepo = {
      getExpense: vi.fn(),
      markReimbursed: vi.fn(),
    };

    mockAuthenticate = vi.fn<(event: APIGatewayProxyEventV2) => Promise<AuthResult>>();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('successful reimbursement', () => {
    it('returns 200 with the reimbursed expense when marking as reimbursed', async () => {
      const expense = makeUnreimbursedExpense();
      const reimbursedExpense = makeReimbursedExpense();

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.getExpense.mockResolvedValue(expense);
      mockRepo.markReimbursed.mockResolvedValue(reimbursedExpense);

      const handler = createReimburseExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('EXP_01HTEST', JSON.stringify({ reimbursedBy: 'Alice Smith' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body as string) as Expense;
      expect(responseBody.reimbursed).toBe(true);
      expect(responseBody.reimbursedAt).toBe('2025-03-15T10:00:00.000Z');
    });

    it('passes correct arguments to repo.markReimbursed', async () => {
      const expense = makeUnreimbursedExpense();
      const reimbursedExpense = makeReimbursedExpense();

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.getExpense.mockResolvedValue(expense);
      mockRepo.markReimbursed.mockResolvedValue(reimbursedExpense);

      const handler = createReimburseExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('EXP_01HTEST', JSON.stringify({ reimbursedBy: 'Alice Smith' }));
      await handler(event);

      expect(mockRepo.markReimbursed).toHaveBeenCalledTimes(1);
      expect(mockRepo.markReimbursed).toHaveBeenCalledWith(
        'acct_01HXYZ',
        'EXP_01HTEST',
        `EXP#${expense.date}#${expense.expenseId}`,
        expense.paidBy,
      );
    });

    it('uses the expense date and paidBy from the fetched expense', async () => {
      const expense = makeUnreimbursedExpense({
        date: '2025-02-20',
        paidBy: 'user-carol-sub',
      });
      const reimbursedExpense = makeReimbursedExpense({
        date: '2025-02-20',
        paidBy: 'user-carol-sub',
      });

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.getExpense.mockResolvedValue(expense);
      mockRepo.markReimbursed.mockResolvedValue(reimbursedExpense);

      const handler = createReimburseExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('EXP_01HTEST', JSON.stringify({ reimbursedBy: 'Alice Smith' }));
      await handler(event);

      expect(mockRepo.markReimbursed).toHaveBeenCalledWith(
        'acct_01HXYZ',
        'EXP_01HTEST',
        'EXP#2025-02-20#EXP_01HTEST',
        'user-carol-sub',
      );
    });
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

      const handler = createReimburseExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('EXP_01HTEST', JSON.stringify({ reimbursedBy: 'Alice' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(mockRepo.getExpense).not.toHaveBeenCalled();
      expect(mockRepo.markReimbursed).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    beforeEach(() => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
    });

    it('returns 400 if expense ID is missing from path', async () => {
      const handler = createReimburseExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('', JSON.stringify({ reimbursedBy: 'Alice' }));
      event.pathParameters = {};
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/expense.*id/i);
      expect(mockRepo.getExpense).not.toHaveBeenCalled();
    });

    it('returns 400 if request body is missing', async () => {
      const handler = createReimburseExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('EXP_01HTEST', undefined);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('INVALID_JSON');
    });

    it('returns 400 if request body is invalid JSON', async () => {
      const handler = createReimburseExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('EXP_01HTEST', '{ not valid }}}');
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('INVALID_JSON');
    });

    it('returns 400 if reimbursedBy is missing from body', async () => {
      const handler = createReimburseExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('EXP_01HTEST', JSON.stringify({}));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/reimbursedBy/i);
    });

    it('returns 400 if reimbursedBy is an empty string', async () => {
      const handler = createReimburseExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('EXP_01HTEST', JSON.stringify({ reimbursedBy: '' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/reimbursedBy/i);
    });

    it('returns 400 if reimbursedBy exceeds 200 characters', async () => {
      const handler = createReimburseExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('EXP_01HTEST', JSON.stringify({ reimbursedBy: 'A'.repeat(201) }));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/reimbursedBy/i);
      expect(responseBody.error).toMatch(/200/);
    });

    it('accepts reimbursedBy exactly 200 characters', async () => {
      const expense = makeUnreimbursedExpense();
      const reimbursedExpense = makeReimbursedExpense();

      mockRepo.getExpense.mockResolvedValue(expense);
      mockRepo.markReimbursed.mockResolvedValue(reimbursedExpense);

      const handler = createReimburseExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('EXP_01HTEST', JSON.stringify({ reimbursedBy: 'A'.repeat(200) }));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  describe('expense not found', () => {
    it('returns 404 when expense does not exist', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.getExpense.mockResolvedValue(null);

      const handler = createReimburseExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('NONEXISTENT', JSON.stringify({ reimbursedBy: 'Alice' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('NOT_FOUND');
      expect(mockRepo.markReimbursed).not.toHaveBeenCalled();
    });
  });

  describe('already reimbursed', () => {
    it('returns 409 when expense is already reimbursed', async () => {
      const alreadyReimbursed = makeReimbursedExpense();

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.getExpense.mockResolvedValue(alreadyReimbursed);

      const handler = createReimburseExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('EXP_01HTEST', JSON.stringify({ reimbursedBy: 'Alice' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('ALREADY_REIMBURSED');
      expect(mockRepo.markReimbursed).not.toHaveBeenCalled();
    });
  });
});
