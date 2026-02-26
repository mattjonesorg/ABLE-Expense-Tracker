import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { AuthResult, AuthContext } from '../../../src/middleware/auth.js';
import type { ExpenseRepository } from '../../../src/lib/dynamo.js';
import type { CreateExpenseInput, Expense, ApiError } from '../../../src/lib/types.js';
import { createCreateExpenseHandler } from '../../../src/handlers/expenses/create.js';

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
 * Build a minimal APIGatewayProxyEventV2 for POST /expenses.
 */
function makeEvent(body: string | undefined, headers: Record<string, string> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /expenses',
    rawPath: '/expenses',
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer valid-token',
      ...headers,
    },
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/expenses',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test-agent',
      },
      requestId: 'request-id',
      routeKey: 'POST /expenses',
      stage: '$default',
      time: '15/Mar/2025:00:00:00 +0000',
      timeEpoch: 1742169600000,
    },
    isBase64Encoded: false,
    body,
  };
}

/**
 * Build a valid expense request body.
 */
function makeValidBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    date: '2025-03-15',
    vendor: 'Walgreens',
    description: 'Medication co-pay',
    amount: 2499,
    category: 'Health, prevention & wellness',
    categoryConfidence: 'ai_confirmed',
    categoryNotes: 'Over-the-counter medication',
    receiptKey: 'receipts/acct_01HXYZ/receipt-001.jpg',
    paidBy: 'user-alice-sub',
    ...overrides,
  };
}

/**
 * Build a mock Expense that the repository would return.
 */
function makeMockExpense(input: CreateExpenseInput): Expense {
  return {
    ...input,
    expenseId: 'MOCK_ULID_01',
    reimbursed: false,
    reimbursedAt: null,
    createdAt: '2025-03-15T10:00:00.000Z',
    updatedAt: '2025-03-15T10:00:00.000Z',
  };
}

describe('createCreateExpenseHandler', () => {
  let mockRepo: { createExpense: ReturnType<typeof vi.fn> };
  let mockAuthenticate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'));

    mockRepo = {
      createExpense: vi.fn(),
    };

    mockAuthenticate = vi.fn<(event: APIGatewayProxyEventV2) => Promise<AuthResult>>();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('successful creation', () => {
    it('returns 201 with created expense on valid input', async () => {
      const body = makeValidBody();
      const expectedInput: CreateExpenseInput = {
        accountId: mockAuthContext.accountId,
        date: body['date'] as string,
        vendor: body['vendor'] as string,
        description: body['description'] as string,
        amount: body['amount'] as number,
        category: body['category'] as CreateExpenseInput['category'],
        categoryConfidence: body['categoryConfidence'] as CreateExpenseInput['categoryConfidence'],
        categoryNotes: body['categoryNotes'] as string,
        receiptKey: body['receiptKey'] as string,
        submittedBy: mockAuthContext.userId,
        paidBy: body['paidBy'] as string,
      };

      const createdExpense = makeMockExpense(expectedInput);

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.createExpense.mockResolvedValue(createdExpense);

      const handler = createCreateExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify(body));
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const responseBody = JSON.parse(result.body as string) as Expense;
      expect(responseBody.expenseId).toBe('MOCK_ULID_01');
      expect(responseBody.vendor).toBe('Walgreens');
      expect(responseBody.amount).toBe(2499);
      expect(responseBody.reimbursed).toBe(false);
    });

    it('stores amount as integer cents (passes through correctly)', async () => {
      const body = makeValidBody({ amount: 15075 });
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.createExpense.mockImplementation((input: CreateExpenseInput) =>
        Promise.resolve(makeMockExpense(input)),
      );

      const handler = createCreateExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify(body));
      await handler(event);

      expect(mockRepo.createExpense).toHaveBeenCalledTimes(1);
      const callArg = mockRepo.createExpense.mock.calls[0][0] as CreateExpenseInput;
      expect(callArg.amount).toBe(15075);
    });

    it('associates expense with authenticated user accountId', async () => {
      const body = makeValidBody();
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.createExpense.mockImplementation((input: CreateExpenseInput) =>
        Promise.resolve(makeMockExpense(input)),
      );

      const handler = createCreateExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify(body));
      await handler(event);

      expect(mockRepo.createExpense).toHaveBeenCalledTimes(1);
      const callArg = mockRepo.createExpense.mock.calls[0][0] as CreateExpenseInput;
      expect(callArg.accountId).toBe('acct_01HXYZ');
    });

    it('sets submittedBy to the authenticated user userId', async () => {
      const body = makeValidBody();
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });
      mockRepo.createExpense.mockImplementation((input: CreateExpenseInput) =>
        Promise.resolve(makeMockExpense(input)),
      );

      const handler = createCreateExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify(body));
      await handler(event);

      expect(mockRepo.createExpense).toHaveBeenCalledTimes(1);
      const callArg = mockRepo.createExpense.mock.calls[0][0] as CreateExpenseInput;
      expect(callArg.submittedBy).toBe('user-alice-sub');
    });
  });

  describe('authentication', () => {
    it('returns 401 when auth middleware fails (no/invalid token)', async () => {
      mockAuthenticate.mockResolvedValue({
        success: false,
        response: {
          statusCode: 401,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ error: 'Missing Authorization header', code: 'UNAUTHORIZED' }),
        },
      });

      const handler = createCreateExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify(makeValidBody()), {});
      // Remove authorization header
      delete event.headers['authorization'];

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('UNAUTHORIZED');
      expect(mockRepo.createExpense).not.toHaveBeenCalled();
    });
  });

  describe('validation — required fields', () => {
    it('returns 400 if vendor is missing', async () => {
      const body = makeValidBody();
      delete body['vendor'];

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });

      const handler = createCreateExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify(body));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/vendor/i);
      expect(mockRepo.createExpense).not.toHaveBeenCalled();
    });

    it('returns 400 if amount is missing', async () => {
      const body = makeValidBody();
      delete body['amount'];

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });

      const handler = createCreateExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify(body));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/amount/i);
      expect(mockRepo.createExpense).not.toHaveBeenCalled();
    });

    it('returns 400 if date is missing', async () => {
      const body = makeValidBody();
      delete body['date'];

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });

      const handler = createCreateExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify(body));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/date/i);
      expect(mockRepo.createExpense).not.toHaveBeenCalled();
    });
  });

  describe('validation — business rules', () => {
    it('rejects negative amounts — returns 400', async () => {
      const body = makeValidBody({ amount: -100 });

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });

      const handler = createCreateExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify(body));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/amount/i);
      expect(mockRepo.createExpense).not.toHaveBeenCalled();
    });

    it('rejects zero amount — returns 400', async () => {
      const body = makeValidBody({ amount: 0 });

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });

      const handler = createCreateExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify(body));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/amount/i);
      expect(mockRepo.createExpense).not.toHaveBeenCalled();
    });

    it('rejects future dates — returns 400', async () => {
      // Current fake time is 2025-03-15, so 2025-03-16 is in the future
      const body = makeValidBody({ date: '2025-03-16' });

      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });

      const handler = createCreateExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent(JSON.stringify(body));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('VALIDATION_ERROR');
      expect(responseBody.error).toMatch(/date/i);
      expect(mockRepo.createExpense).not.toHaveBeenCalled();
    });
  });

  describe('validation — malformed input', () => {
    it('returns 400 for malformed JSON body', async () => {
      mockAuthenticate.mockResolvedValue({ success: true, context: mockAuthContext });

      const handler = createCreateExpenseHandler({
        repo: mockRepo as unknown as ExpenseRepository,
        authenticate: mockAuthenticate,
      });

      const event = makeEvent('{ not valid json }}}');
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string) as ApiError;
      expect(responseBody.code).toBe('INVALID_JSON');
      expect(mockRepo.createExpense).not.toHaveBeenCalled();
    });
  });
});
