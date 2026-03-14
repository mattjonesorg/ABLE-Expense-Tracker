import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { AuthResult, AuthContext } from '../../../src/middleware/auth.js';
import type { ExpenseRepository } from '../../../src/lib/dynamo.js';
import type { Expense, ReimbursementSummary, ApiError } from '../../../src/lib/types.js';
import { createDashboardReimbursementsHandler } from '../../../src/handlers/dashboard/reimbursements.js';

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
 * Build a minimal APIGatewayProxyEventV2 for GET /dashboard/reimbursements.
 */
function makeEvent(): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /dashboard/reimbursements',
    rawPath: '/dashboard/reimbursements',
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
        method: 'GET',
        path: '/dashboard/reimbursements',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test-agent',
      },
      requestId: 'request-id',
      routeKey: 'GET /dashboard/reimbursements',
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
    paidBy: 'Alice Smith',
    reimbursed: false,
    reimbursedAt: null,
    createdAt: '2025-03-15T10:00:00.000Z',
    updatedAt: '2025-03-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('createDashboardReimbursementsHandler', () => {
  let mockRepo: {
    listExpenses: ReturnType<typeof vi.fn>;
  };
  let mockAuthenticate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRepo = {
      listExpenses: vi.fn(),
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

      const handler = createDashboardReimbursementsHandler({
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
    });
  });

  describe('happy path — empty summaries', () => {
    it('returns 200 with empty summaries when no unreimbursed expenses exist', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.listExpenses.mockResolvedValue([]);

      const handler = createDashboardReimbursementsHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string) as { summaries: ReimbursementSummary[] };
      expect(body.summaries).toEqual([]);
    });

    it('calls repo.listExpenses with reimbursed: false filter', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.listExpenses.mockResolvedValue([]);

      const handler = createDashboardReimbursementsHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      await handler(makeEvent());

      expect(mockRepo.listExpenses).toHaveBeenCalledWith('acct_01HXYZ', { reimbursed: false });
    });
  });

  describe('happy path — single payer', () => {
    it('returns one summary for a single payer with correct totals', async () => {
      const expenses = [
        makeMockExpense({ expenseId: 'EXP_01', amount: 2499, paidBy: 'Bob Jones' }),
        makeMockExpense({ expenseId: 'EXP_02', amount: 1500, paidBy: 'Bob Jones' }),
      ];

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.listExpenses.mockResolvedValue(expenses);

      const handler = createDashboardReimbursementsHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string) as { summaries: ReimbursementSummary[] };
      expect(body.summaries).toHaveLength(1);
      expect(body.summaries[0]).toEqual({
        userId: 'Bob Jones',
        displayName: 'Bob Jones',
        totalOwed: 3999,
        expenseCount: 2,
      });
    });
  });

  describe('happy path — multiple payers', () => {
    it('returns separate summaries for each payer', async () => {
      const expenses = [
        makeMockExpense({ expenseId: 'EXP_01', amount: 2499, paidBy: 'Bob Jones' }),
        makeMockExpense({ expenseId: 'EXP_02', amount: 1500, paidBy: 'Carol White' }),
        makeMockExpense({ expenseId: 'EXP_03', amount: 3000, paidBy: 'Bob Jones' }),
      ];

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.listExpenses.mockResolvedValue(expenses);

      const handler = createDashboardReimbursementsHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string) as { summaries: ReimbursementSummary[] };
      expect(body.summaries).toHaveLength(2);

      const bob = body.summaries.find((s) => s.displayName === 'Bob Jones');
      const carol = body.summaries.find((s) => s.displayName === 'Carol White');

      expect(bob).toEqual({
        userId: 'Bob Jones',
        displayName: 'Bob Jones',
        totalOwed: 5499,
        expenseCount: 2,
      });
      expect(carol).toEqual({
        userId: 'Carol White',
        displayName: 'Carol White',
        totalOwed: 1500,
        expenseCount: 1,
      });
    });
  });

  describe('aggregation correctness', () => {
    it('sums amounts correctly across many expenses', async () => {
      const expenses = [
        makeMockExpense({ expenseId: 'EXP_01', amount: 100, paidBy: 'Alice' }),
        makeMockExpense({ expenseId: 'EXP_02', amount: 200, paidBy: 'Alice' }),
        makeMockExpense({ expenseId: 'EXP_03', amount: 300, paidBy: 'Alice' }),
        makeMockExpense({ expenseId: 'EXP_04', amount: 400, paidBy: 'Alice' }),
      ];

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.listExpenses.mockResolvedValue(expenses);

      const handler = createDashboardReimbursementsHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const result = await handler(makeEvent());
      const body = JSON.parse(result.body as string) as { summaries: ReimbursementSummary[] };

      expect(body.summaries).toHaveLength(1);
      expect(body.summaries[0].totalOwed).toBe(1000);
      expect(body.summaries[0].expenseCount).toBe(4);
    });
  });

  describe('error handling', () => {
    it('rethrows DynamoDB errors', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.listExpenses.mockRejectedValue(new Error('DynamoDB service unavailable'));

      const handler = createDashboardReimbursementsHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      await expect(handler(makeEvent())).rejects.toThrow('DynamoDB service unavailable');
    });
  });

  describe('response format', () => {
    it('sets content-type to application/json', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.listExpenses.mockResolvedValue([]);

      const handler = createDashboardReimbursementsHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const result = await handler(makeEvent());

      expect(result.headers).toEqual(
        expect.objectContaining({ 'content-type': 'application/json' }),
      );
    });
  });
});
