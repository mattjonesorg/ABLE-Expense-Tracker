import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Expense, CategoryResult } from '../../src/lib/types';

vi.mock('../../src/lib/config', () => ({ API_URL: 'https://api.test.example.com' }));

const mockGetIdToken = vi.fn<() => string | null>();
vi.mock('../../src/lib/auth', () => ({ getIdToken: () => mockGetIdToken() }));

const apiModule = await import('../../src/lib/api');
const { listExpenses, createExpense, categorizeExpense, getExpense, reimburseExpense, ApiAuthenticationError, ApiServerError, ApiNetworkError, ApiResponseParseError } = apiModule;

type ExpenseFormInput = (typeof apiModule)['createExpense'] extends (data: infer T) => unknown ? T : never;

function buildMockExpense(overrides?: Partial<Expense>): Expense {
  return { expenseId: '01JBQE1A2B3C4D5E6F7G8H9J0K', accountId: 'acct_001', date: '2026-02-15', vendor: 'Test Vendor', description: 'Test description', amount: 7500, category: 'Transportation', categoryConfidence: 'ai_confirmed', categoryNotes: 'Qualified expense.', receiptKey: null, submittedBy: 'user_001', paidBy: 'Matt', reimbursed: false, reimbursedAt: null, createdAt: '2026-02-15T10:30:00Z', updatedAt: '2026-02-15T10:30:00Z', ...overrides };
}

function buildMockCategoryResult(): CategoryResult {
  return { suggestedCategory: 'Education', confidence: 'high', reasoning: 'This appears to be an education expense.', followUpQuestion: null };
}

describe('API Client (real fetch calls)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => { mockGetIdToken.mockReturnValue('mock-id-token-abc123'); fetchSpy = vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => { vi.restoreAllMocks(); });

  describe('Authentication header', () => {
    it('includes Authorization Bearer header with the id token', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ expenses: [buildMockExpense()] }), { status: 200, headers: { 'content-type': 'application/json' } }));
      await listExpenses();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer mock-id-token-abc123');
    });
    it('throws ApiAuthenticationError when no token is available', async () => {
      mockGetIdToken.mockReturnValue(null);
      await expect(listExpenses()).rejects.toThrow(ApiAuthenticationError);
    });
  });

  describe('listExpenses', () => {
    it('sends GET request to /expenses', async () => {
      const mockExpenses = [buildMockExpense()];
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ expenses: mockExpenses }), { status: 200, headers: { 'content-type': 'application/json' } }));
      const result = await listExpenses();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.example.com/expenses');
      expect(init.method).toBe('GET');
      expect(result).toEqual(mockExpenses);
    });
    it('passes category filter', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ expenses: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
      await listExpenses({ category: 'Education' });
      expect(new URL((fetchSpy.mock.calls[0] as [string])[0]).searchParams.get('category')).toBe('Education');
    });
    it('passes startDate filter', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ expenses: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
      await listExpenses({ startDate: '2026-01-01' });
      expect(new URL((fetchSpy.mock.calls[0] as [string])[0]).searchParams.get('startDate')).toBe('2026-01-01');
    });
    it('passes endDate filter', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ expenses: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
      await listExpenses({ endDate: '2026-12-31' });
      expect(new URL((fetchSpy.mock.calls[0] as [string])[0]).searchParams.get('endDate')).toBe('2026-12-31');
    });
    it('passes multiple filters', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ expenses: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
      await listExpenses({ category: 'Housing', startDate: '2026-01-01', endDate: '2026-06-30' });
      const parsed = new URL((fetchSpy.mock.calls[0] as [string])[0]);
      expect(parsed.searchParams.get('category')).toBe('Housing');
      expect(parsed.searchParams.get('startDate')).toBe('2026-01-01');
      expect(parsed.searchParams.get('endDate')).toBe('2026-06-30');
    });
    it('does not add query params when filters are empty', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ expenses: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
      await listExpenses({});
      expect((fetchSpy.mock.calls[0] as [string])[0]).toBe('https://api.test.example.com/expenses');
    });
    it('does not add query params when category is empty string', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ expenses: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
      await listExpenses({ category: '' });
      expect((fetchSpy.mock.calls[0] as [string])[0]).toBe('https://api.test.example.com/expenses');
    });
    it('returns the expenses array from response wrapper', async () => {
      const expenses = [buildMockExpense(), buildMockExpense({ expenseId: 'exp_2' })];
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ expenses }), { status: 200, headers: { 'content-type': 'application/json' } }));
      const result = await listExpenses();
      expect(result).toHaveLength(2);
    });
  });

  describe('getExpense', () => {
    it('sends GET request to /expenses/{id}', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(buildMockExpense()), { status: 200, headers: { 'content-type': 'application/json' } }));
      const result = await getExpense('exp_123');
      expect((fetchSpy.mock.calls[0] as [string])[0]).toBe('https://api.test.example.com/expenses/exp_123');
      expect(result).toEqual(buildMockExpense());
    });
    it('throws on 404', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: 'Expense not found', code: 'NOT_FOUND' }), { status: 404, headers: { 'content-type': 'application/json' } }));
      await expect(getExpense('nonexistent')).rejects.toThrow('Expense not found');
    });
  });

  describe('createExpense', () => {
    const validInput: ExpenseFormInput = { vendor: 'Test Vendor', description: 'Test description', amount: 2599, date: '2026-02-26', paidBy: 'John Doe', category: 'Education', categoryConfidence: 'user_selected', receiptFile: null };
    it('sends POST request to /expenses', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(buildMockExpense({ vendor: 'Test Vendor', amount: 2599 })), { status: 201, headers: { 'content-type': 'application/json' } }));
      await createExpense(validInput);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.example.com/expenses');
      expect(init.method).toBe('POST');
      expect(init.headers).toHaveProperty('Content-Type', 'application/json');
    });
    it('sends correct fields in body', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(buildMockExpense()), { status: 201, headers: { 'content-type': 'application/json' } }));
      await createExpense(validInput);
      const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;
      expect(body['vendor']).toBe('Test Vendor');
      expect(body['amount']).toBe(2599);
    });
    it('does not send receiptFile', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(buildMockExpense()), { status: 201, headers: { 'content-type': 'application/json' } }));
      await createExpense(validInput);
      const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;
      expect(body).not.toHaveProperty('receiptFile');
    });
    it('returns the created expense', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(buildMockExpense({ vendor: 'Test Vendor' })), { status: 201, headers: { 'content-type': 'application/json' } }));
      const result = await createExpense(validInput);
      expect(result.vendor).toBe('Test Vendor');
    });
    it('handles null category', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(buildMockExpense()), { status: 201, headers: { 'content-type': 'application/json' } }));
      await createExpense({ ...validInput, category: null });
      const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;
      expect(body['category']).toBeNull();
    });
  });

  describe('categorizeExpense', () => {
    it('sends POST to /categorize', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(buildMockCategoryResult()), { status: 200, headers: { 'content-type': 'application/json' } }));
      await categorizeExpense({ vendor: 'University', description: 'Tuition' });
      expect((fetchSpy.mock.calls[0] as [string])[0]).toBe('https://api.test.example.com/categorize');
    });
    it('returns the category result', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(buildMockCategoryResult()), { status: 200, headers: { 'content-type': 'application/json' } }));
      const result = await categorizeExpense({ vendor: 'University', description: 'Tuition' });
      expect(result.suggestedCategory).toBe('Education');
    });
    it('handles null result', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ result: null }), { status: 200, headers: { 'content-type': 'application/json' } }));
      const result = await categorizeExpense({ vendor: 'Unknown', description: 'Something' });
      expect(result).toBeNull();
    });
  });

  describe('reimburseExpense', () => {
    it('sends POST to /expenses/{id}/reimburse', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(buildMockExpense({ reimbursed: true, reimbursedAt: '2026-02-26T12:00:00Z' })), { status: 200, headers: { 'content-type': 'application/json' } }));
      const result = await reimburseExpense('exp_123');
      expect((fetchSpy.mock.calls[0] as [string])[0]).toBe('https://api.test.example.com/expenses/exp_123/reimburse');
      expect(result.reimbursed).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('throws ApiAuthenticationError on 401', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } }));
      await expect(listExpenses()).rejects.toThrow(ApiAuthenticationError);
    });
    it('throws Error with API message on 400', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: 'vendor is required' }), { status: 400, headers: { 'content-type': 'application/json' } }));
      await expect(createExpense({ vendor: '', description: 'Test', amount: 100, date: '2026-02-26', paidBy: 'Jane', category: null, categoryConfidence: 'user_selected', receiptFile: null })).rejects.toThrow('vendor is required');
    });
    it('throws on 500', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'content-type': 'application/json' } }));
      await expect(listExpenses()).rejects.toThrow();
    });
    it('throws on network failure', async () => {
      fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(listExpenses()).rejects.toThrow();
    });
    it('throws on non-JSON error response', async () => {
      fetchSpy.mockResolvedValue(new Response('Bad Gateway', { status: 502, headers: { 'content-type': 'text/plain' } }));
      await expect(listExpenses()).rejects.toThrow();
    });
  });

  describe('User-friendly error messages', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
    afterEach(() => { consoleSpy.mockRestore(); });

    it('401 errors show session expired message', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } }));
      const err = await listExpenses().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiAuthenticationError);
      expect((err as Error).message).toBe('Your session has expired. Please log in again.');
    });
    it('500 errors show user-friendly server error message', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'content-type': 'application/json' } }));
      const err = await listExpenses().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiServerError);
      expect((err as Error).message).toBe('Something went wrong on our end. Please try again.');
    });
    it('503 errors show user-friendly server error message', async () => {
      fetchSpy.mockResolvedValue(new Response('Service Unavailable', { status: 503, headers: { 'content-type': 'text/plain' } }));
      const err = await listExpenses().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiServerError);
      expect((err as Error).message).toBe('Something went wrong on our end. Please try again.');
    });
    it('network errors show connection failure message', async () => {
      fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
      const err = await listExpenses().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiNetworkError);
      expect((err as Error).message).toBe('Unable to reach the server. Check your internet connection.');
    });
    it('network errors from DNS failure show connection failure message', async () => {
      fetchSpy.mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource'));
      const err = await listExpenses().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiNetworkError);
      expect((err as Error).message).toBe('Unable to reach the server. Check your internet connection.');
    });
    it('JSON parse errors show unexpected response message', async () => {
      fetchSpy.mockResolvedValue(new Response('not valid json at all', { status: 200, headers: { 'content-type': 'application/json' } }));
      const err = await listExpenses().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiResponseParseError);
      expect((err as Error).message).toBe('We received an unexpected response. Please try again.');
    });
    it('logs original technical error to console for 500 errors', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: 'NullPointerException' }), { status: 500, headers: { 'content-type': 'application/json' } }));
      await expect(listExpenses()).rejects.toThrow(ApiServerError);
      expect(consoleSpy).toHaveBeenCalled();
    });
    it('logs original technical error to console for network errors', async () => {
      fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(listExpenses()).rejects.toThrow(ApiNetworkError);
      expect(consoleSpy).toHaveBeenCalled();
    });
    it('logs original technical error to console for JSON parse errors', async () => {
      fetchSpy.mockResolvedValue(new Response('not valid json', { status: 200, headers: { 'content-type': 'application/json' } }));
      await expect(listExpenses()).rejects.toThrow(ApiResponseParseError);
      expect(consoleSpy).toHaveBeenCalled();
    });
    it('4xx validation errors pass through API error message', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: 'description must be at most 1000 characters' }), { status: 400, headers: { 'content-type': 'application/json' } }));
      await expect(listExpenses()).rejects.toThrow('description must be at most 1000 characters');
    });
    it('non-JSON 4xx errors show status-based fallback', async () => {
      fetchSpy.mockResolvedValue(new Response('Bad Request', { status: 400, headers: { 'content-type': 'text/plain' } }));
      await expect(listExpenses()).rejects.toThrow();
    });
  });
});
