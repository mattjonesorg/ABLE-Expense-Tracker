import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { AuthResult, AuthContext } from '../../../src/middleware/auth.js';
import type { ExpenseRepository } from '../../../src/lib/dynamo.js';
import type { Expense, ApiError, BulkReimburseResponse } from '../../../src/lib/types.js';
import { createReimburseBulkHandler } from '../../../src/handlers/expenses/reimburse-bulk.js';

const mockAuthContext: AuthContext = {
  userId: 'user-alice-sub',
  accountId: 'acct_01HXYZ',
  email: 'alice@example.com',
  displayName: 'Alice Smith',
  role: 'owner',
};

function makeEvent(body: string | undefined): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /expenses/reimburse-bulk',
    rawPath: '/expenses/reimburse-bulk',
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer valid-token',
    },
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/expenses/reimburse-bulk',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test-agent',
      },
      requestId: 'request-id',
      routeKey: 'POST /expenses/reimburse-bulk',
      stage: '$default',
      time: '15/Mar/2025:00:00:00 +0000',
      timeEpoch: 1742169600000,
    },
    isBase64Encoded: false,
    body,
  };
}

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

function makeReimbursedExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    ...makeUnreimbursedExpense(),
    reimbursed: true,
    reimbursedAt: '2025-03-15T10:00:00.000Z',
    updatedAt: '2025-03-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('createReimburseBulkHandler', () => {
  let mockRepo: {
    getExpense: ReturnType<typeof vi.fn>;
    markReimbursedBulk: ReturnType<typeof vi.fn>;
  };
  let mockAuthenticate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'));

    mockRepo = {
      getExpense: vi.fn(),
      markReimbursedBulk: vi.fn(),
    };

    mockAuthenticate = vi.fn<(event: APIGatewayProxyEventV2) => Promise<AuthResult>>();
  });

  afterEach(() => {
    vi.useRealTimers();
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

      const handler = createReimburseBulkHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify({ expenseIds: ['EXP_A'], reimbursedBy: 'Alice' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(mockRepo.getExpense).not.toHaveBeenCalled();
      expect(mockRepo.markReimbursedBulk).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    beforeEach(() => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
    });

    it('returns 400 if request body is missing', async () => {
      const handler = createReimburseBulkHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(undefined);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('INVALID_JSON');
    });

    it('returns 400 if request body is invalid JSON', async () => {
      const handler = createReimburseBulkHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('{ not valid }}}');
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('INVALID_JSON');
    });

    it('returns 400 if expenseIds is missing', async () => {
      const handler = createReimburseBulkHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify({ reimbursedBy: 'Alice' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/expenseIds/i);
    });

    it('returns 400 if expenseIds is not an array', async () => {
      const handler = createReimburseBulkHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify({ expenseIds: 'not-array', reimbursedBy: 'Alice' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/expenseIds/i);
    });

    it('returns 400 if expenseIds is empty', async () => {
      const handler = createReimburseBulkHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify({ expenseIds: [], reimbursedBy: 'Alice' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/expenseIds/i);
    });

    it('returns 400 if expenseIds has more than 100 items', async () => {
      const handler = createReimburseBulkHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const ids = Array.from({ length: 101 }, (_, i) => `EXP_${i}`);
      const event = makeEvent(JSON.stringify({ expenseIds: ids, reimbursedBy: 'Alice' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/100/);
    });

    it('returns 400 if reimbursedBy is missing', async () => {
      const handler = createReimburseBulkHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify({ expenseIds: ['EXP_A'] }));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/reimbursedBy/i);
    });

    it('returns 400 if reimbursedBy is empty string', async () => {
      const handler = createReimburseBulkHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify({ expenseIds: ['EXP_A'], reimbursedBy: '' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/reimbursedBy/i);
    });

    it('returns 400 if reimbursedBy exceeds 200 characters', async () => {
      const handler = createReimburseBulkHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify({ expenseIds: ['EXP_A'], reimbursedBy: 'A'.repeat(201) }));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/200/);
    });

    it('accepts exactly 100 expense IDs', async () => {
      const ids = Array.from({ length: 100 }, (_, i) => `EXP_${i}`);
      const expenses = ids.map((id) => makeUnreimbursedExpense({ expenseId: id }));
      const reimbursedExpenses = ids.map((id) => makeReimbursedExpense({ expenseId: id }));

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      for (let i = 0; i < 100; i++) {
        mockRepo.getExpense.mockResolvedValueOnce(expenses[i]);
      }
      mockRepo.markReimbursedBulk.mockResolvedValue(reimbursedExpenses);

      const handler = createReimburseBulkHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify({ expenseIds: ids, reimbursedBy: 'Alice' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  describe('expense not found', () => {
    it('returns 404 when any expense ID does not exist', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.getExpense.mockResolvedValueOnce(makeUnreimbursedExpense({ expenseId: 'EXP_A' }));
      mockRepo.getExpense.mockResolvedValueOnce(null);

      const handler = createReimburseBulkHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify({ expenseIds: ['EXP_A', 'NONEXISTENT'], reimbursedBy: 'Alice' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('NOT_FOUND');
      expect(mockRepo.markReimbursedBulk).not.toHaveBeenCalled();
    });
  });

  describe('already reimbursed', () => {
    it('returns 409 when any expense is already reimbursed', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.getExpense.mockResolvedValueOnce(makeUnreimbursedExpense({ expenseId: 'EXP_A' }));
      mockRepo.getExpense.mockResolvedValueOnce(makeReimbursedExpense({ expenseId: 'EXP_B' }));

      const handler = createReimburseBulkHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify({ expenseIds: ['EXP_A', 'EXP_B'], reimbursedBy: 'Alice' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('ALREADY_REIMBURSED');
      expect(responseBody.details).toEqual({ alreadyReimbursedIds: ['EXP_B'] });
      expect(mockRepo.markReimbursedBulk).not.toHaveBeenCalled();
    });

    it('returns all already reimbursed IDs in details', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.getExpense.mockResolvedValueOnce(makeReimbursedExpense({ expenseId: 'EXP_A' }));
      mockRepo.getExpense.mockResolvedValueOnce(makeReimbursedExpense({ expenseId: 'EXP_B' }));

      const handler = createReimburseBulkHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify({ expenseIds: ['EXP_A', 'EXP_B'], reimbursedBy: 'Alice' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.details).toEqual({ alreadyReimbursedIds: ['EXP_A', 'EXP_B'] });
    });
  });

  describe('successful bulk reimbursement', () => {
    it('returns 200 with expenses and count', async () => {
      const expense1 = makeUnreimbursedExpense({ expenseId: 'EXP_A' });
      const expense2 = makeUnreimbursedExpense({ expenseId: 'EXP_B' });
      const reimbursed1 = makeReimbursedExpense({ expenseId: 'EXP_A' });
      const reimbursed2 = makeReimbursedExpense({ expenseId: 'EXP_B' });

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.getExpense.mockResolvedValueOnce(expense1);
      mockRepo.getExpense.mockResolvedValueOnce(expense2);
      mockRepo.markReimbursedBulk.mockResolvedValue([reimbursed1, reimbursed2]);

      const handler = createReimburseBulkHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify({ expenseIds: ['EXP_A', 'EXP_B'], reimbursedBy: 'Alice' }));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body as string) as BulkReimburseResponse;
      expect(responseBody.count).toBe(2);
      expect(responseBody.expenses).toHaveLength(2);
      expect(responseBody.expenses[0].reimbursed).toBe(true);
    });

    it('passes correct arguments to repo.markReimbursedBulk', async () => {
      const expense1 = makeUnreimbursedExpense({ expenseId: 'EXP_A' });
      const expense2 = makeUnreimbursedExpense({ expenseId: 'EXP_B' });

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.getExpense.mockResolvedValueOnce(expense1);
      mockRepo.getExpense.mockResolvedValueOnce(expense2);
      mockRepo.markReimbursedBulk.mockResolvedValue([makeReimbursedExpense({ expenseId: 'EXP_A' }), makeReimbursedExpense({ expenseId: 'EXP_B' })]);

      const handler = createReimburseBulkHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify({ expenseIds: ['EXP_A', 'EXP_B'], reimbursedBy: 'Alice' }));
      await handler(event);

      expect(mockRepo.markReimbursedBulk).toHaveBeenCalledTimes(1);
      expect(mockRepo.markReimbursedBulk).toHaveBeenCalledWith(
        'acct_01HXYZ',
        [expense1, expense2],
      );
    });
  });
});
