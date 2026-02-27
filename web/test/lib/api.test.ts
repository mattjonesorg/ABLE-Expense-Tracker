import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Expense, CategoryResult } from '../../src/lib/types';

// Mock config module before importing api
vi.mock('../../src/lib/config', () => ({
  API_URL: 'https://api.test.example.com',
}));

// Mock auth module before importing api
const mockGetIdToken = vi.fn<() => string | null>();
vi.mock('../../src/lib/auth', () => ({
  getIdToken: () => mockGetIdToken(),
}));

// Import after mocks are set up
const apiModule = await import('../../src/lib/api');
const {
  listExpenses,
  createExpense,
  categorizeExpense,
  getExpense,
  reimburseExpense,
  ApiAuthenticationError,
} = apiModule;

type ExpenseFormInput = (typeof apiModule)['createExpense'] extends (
  data: infer T,
) => unknown
  ? T
  : never;

// --- Test Data ---

function buildMockExpense(overrides?: Partial<Expense>): Expense {
  return {
    expenseId: '01JBQE1A2B3C4D5E6F7G8H9J0K',
    accountId: 'acct_001',
    date: '2026-02-15',
    vendor: 'Test Vendor',
    description: 'Test description',
    amount: 7500,
    category: 'Transportation',
    categoryConfidence: 'ai_confirmed',
    categoryNotes: 'Qualified expense.',
    receiptKey: null,
    submittedBy: 'user_001',
    paidBy: 'Matt',
    reimbursed: false,
    reimbursedAt: null,
    createdAt: '2026-02-15T10:30:00Z',
    updatedAt: '2026-02-15T10:30:00Z',
    ...overrides,
  };
}

function buildMockCategoryResult(): CategoryResult {
  return {
    suggestedCategory: 'Education',
    confidence: 'high',
    reasoning: 'This appears to be an education expense.',
    followUpQuestion: null,
  };
}

// --- Tests ---

describe('API Client (real fetch calls)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockGetIdToken.mockReturnValue('mock-id-token-abc123');
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication header', () => {
    it('includes Authorization Bearer header with the id token', async () => {
      const mockExpense = buildMockExpense();
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ expenses: [mockExpense] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      await listExpenses();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer mock-id-token-abc123');
    });

    it('throws ApiAuthenticationError when no token is available', async () => {
      mockGetIdToken.mockReturnValue(null);

      await expect(listExpenses()).rejects.toThrow(ApiAuthenticationError);
    });
  });

  describe('listExpenses', () => {
    it('sends GET request to /expenses', async () => {
      const mockExpenses = [buildMockExpense()];
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ expenses: mockExpenses }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const result = await listExpenses();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.example.com/expenses');
      expect(init.method).toBe('GET');
      expect(result).toEqual(mockExpenses);
    });

    it('passes category filter as query parameter', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ expenses: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      await listExpenses({ category: 'Education' });

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const parsed = new URL(url);
      expect(parsed.searchParams.get('category')).toBe('Education');
    });

    it('passes startDate filter as query parameter', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ expenses: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      await listExpenses({ startDate: '2026-01-01' });

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const parsed = new URL(url);
      expect(parsed.searchParams.get('startDate')).toBe('2026-01-01');
    });

    it('passes endDate filter as query parameter', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ expenses: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      await listExpenses({ endDate: '2026-12-31' });

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const parsed = new URL(url);
      expect(parsed.searchParams.get('endDate')).toBe('2026-12-31');
    });

    it('passes multiple filters as query parameters', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ expenses: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      await listExpenses({
        category: 'Housing',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
      });

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const parsed = new URL(url);
      expect(parsed.searchParams.get('category')).toBe('Housing');
      expect(parsed.searchParams.get('startDate')).toBe('2026-01-01');
      expect(parsed.searchParams.get('endDate')).toBe('2026-06-30');
    });

    it('does not add query params when filters are empty', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ expenses: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      await listExpenses({});

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.example.com/expenses');
    });

    it('does not add query params when category is empty string', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ expenses: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      await listExpenses({ category: '' });

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.example.com/expenses');
    });

    it('returns the expenses array from the response wrapper', async () => {
      const expenses = [buildMockExpense(), buildMockExpense({ expenseId: 'exp_2' })];
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ expenses }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const result = await listExpenses();
      expect(result).toHaveLength(2);
      expect(result[0].expenseId).toBe('01JBQE1A2B3C4D5E6F7G8H9J0K');
      expect(result[1].expenseId).toBe('exp_2');
    });
  });

  describe('getExpense', () => {
    it('sends GET request to /expenses/{id}', async () => {
      const mockExpense = buildMockExpense();
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockExpense), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const result = await getExpense('exp_123');

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.example.com/expenses/exp_123');
      expect(init.method).toBe('GET');
      expect(result).toEqual(mockExpense);
    });

    it('throws on 404 not found', async () => {
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'Expense not found', code: 'NOT_FOUND' }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        ),
      );

      await expect(getExpense('nonexistent')).rejects.toThrow('Expense not found');
    });
  });

  describe('createExpense', () => {
    const validInput: ExpenseFormInput = {
      vendor: 'Test Vendor',
      description: 'Test description',
      amount: 2599,
      date: '2026-02-26',
      paidBy: 'John Doe',
      category: 'Education',
      categoryConfidence: 'user_selected',
      receiptFile: null,
    };

    it('sends POST request to /expenses with JSON body', async () => {
      const createdExpense = buildMockExpense({
        vendor: 'Test Vendor',
        amount: 2599,
      });
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(createdExpense), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );

      await createExpense(validInput);

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.example.com/expenses');
      expect(init.method).toBe('POST');
      expect(init.headers).toHaveProperty('Content-Type', 'application/json');
    });

    it('sends the correct fields in the request body', async () => {
      const createdExpense = buildMockExpense();
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(createdExpense), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );

      await createExpense(validInput);

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body['vendor']).toBe('Test Vendor');
      expect(body['description']).toBe('Test description');
      expect(body['amount']).toBe(2599);
      expect(body['date']).toBe('2026-02-26');
      expect(body['paidBy']).toBe('John Doe');
      expect(body['category']).toBe('Education');
      expect(body['categoryConfidence']).toBe('user_selected');
    });

    it('does not send receiptFile in the request body', async () => {
      const createdExpense = buildMockExpense();
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(createdExpense), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );

      await createExpense(validInput);

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body).not.toHaveProperty('receiptFile');
    });

    it('returns the created expense from the response', async () => {
      const createdExpense = buildMockExpense({ vendor: 'Test Vendor' });
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(createdExpense), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const result = await createExpense(validInput);
      expect(result.vendor).toBe('Test Vendor');
      expect(result.expenseId).toBeTruthy();
    });

    it('handles null category by sending null', async () => {
      const createdExpense = buildMockExpense();
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(createdExpense), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );

      await createExpense({ ...validInput, category: null });

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body['category']).toBeNull();
    });
  });

  describe('categorizeExpense', () => {
    it('sends POST request to /categorize with vendor and description', async () => {
      const mockResult = buildMockCategoryResult();
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResult), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      await categorizeExpense({ vendor: 'University', description: 'Tuition' });

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.example.com/categorize');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body['vendor']).toBe('University');
      expect(body['description']).toBe('Tuition');
    });

    it('returns the category result', async () => {
      const mockResult = buildMockCategoryResult();
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockResult), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const result = await categorizeExpense({
        vendor: 'University',
        description: 'Tuition',
      });

      expect(result.suggestedCategory).toBe('Education');
      expect(result.confidence).toBe('high');
      expect(result.reasoning).toBeTruthy();
    });

    it('handles null result from graceful degradation', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ result: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const result = await categorizeExpense({
        vendor: 'Unknown',
        description: 'Something',
      });

      // When the API returns { result: null }, categorizeExpense should
      // return a fallback result or throw — based on implementation.
      // The existing callers expect a CategoryResult, so we handle graceful null.
      expect(result).toBeNull();
    });
  });

  describe('reimburseExpense', () => {
    it('sends POST request to /expenses/{id}/reimburse', async () => {
      const reimbursedExpense = buildMockExpense({
        reimbursed: true,
        reimbursedAt: '2026-02-26T12:00:00Z',
      });
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(reimbursedExpense), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const result = await reimburseExpense('exp_123');

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.example.com/expenses/exp_123/reimburse');
      expect(init.method).toBe('POST');
      expect(result.reimbursed).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('throws ApiAuthenticationError on 401 response', async () => {
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'Unauthorized', code: 'AUTH_ERROR' }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
      );

      await expect(listExpenses()).rejects.toThrow(ApiAuthenticationError);
    });

    it('throws Error with API error message on 400 response', async () => {
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'vendor is required',
            code: 'VALIDATION_ERROR',
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        ),
      );

      await expect(
        createExpense({
          vendor: '',
          description: 'Test',
          amount: 100,
          date: '2026-02-26',
          paidBy: 'Jane',
          category: null,
          categoryConfidence: 'user_selected',
          receiptFile: null,
        }),
      ).rejects.toThrow('vendor is required');
    });

    it('throws Error with server error message on 500 response', async () => {
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'Internal server error', code: 'SERVER_ERROR' }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        ),
      );

      await expect(listExpenses()).rejects.toThrow();
    });

    it('throws Error on network failure', async () => {
      fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(listExpenses()).rejects.toThrow();
    });

    it('throws Error with generic message on non-JSON error response', async () => {
      fetchSpy.mockResolvedValue(
        new Response('Bad Gateway', {
          status: 502,
          headers: { 'content-type': 'text/plain' },
        }),
      );

      await expect(listExpenses()).rejects.toThrow();
    });
  });
});
