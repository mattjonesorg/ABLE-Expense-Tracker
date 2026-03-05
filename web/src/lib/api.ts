/**
 * API client for ABLE Tracker.
 * Makes real fetch calls to the deployed API Gateway endpoints.
 * All requests require an authenticated user (Bearer token).
 *
 * Replaces the previous mock implementation as part of issue #54.
 */

import type { Expense, AbleCategory, CategoryResult, ReimbursementSummary } from './types';
import { API_URL } from './config';
import { getIdToken } from './auth';

// --- Exported Types ---

/** Input for creating a new expense via the form */
export interface ExpenseFormInput {
  vendor: string;
  description: string;
  /** Amount in cents (integer) */
  amount: number;
  /** Date as YYYY-MM-DD string */
  date: string;
  paidBy: string;
  category: AbleCategory | null;
  categoryConfidence: 'ai_confirmed' | 'ai_suggested' | 'user_selected';
  receiptFile: File | null;
}

/** Input for AI categorization */
export interface CategorizeInput {
  vendor: string;
  description: string;
}

/** Filters for listing expenses */
export interface ListExpensesFilters {
  category?: AbleCategory | '';
  startDate?: string;
  endDate?: string;
}

// --- Error Classes ---

/**
 * Thrown when the user's authentication token is missing or rejected (401).
 * Consumers should redirect to the login page when catching this error.
 */
export class ApiAuthenticationError extends Error {
  constructor(message = 'Your session has expired. Please log in again.') {
    super(message);
    this.name = 'ApiAuthenticationError';
  }
}

/**
 * Thrown when the server returns a 5xx error.
 * Shows a user-friendly message; technical details are logged to console.
 */
export class ApiServerError extends Error {
  constructor(message = 'Something went wrong on our end. Please try again.') {
    super(message);
    this.name = 'ApiServerError';
  }
}

/**
 * Thrown when a network error prevents the request from completing.
 * Shows a user-friendly message; technical details are logged to console.
 */
export class ApiNetworkError extends Error {
  constructor(
    message = 'Unable to reach the server. Check your internet connection.',
  ) {
    super(message);
    this.name = 'ApiNetworkError';
  }
}

/**
 * Thrown when the response body cannot be parsed as JSON.
 * Shows a user-friendly message; technical details are logged to console.
 */
export class ApiResponseParseError extends Error {
  constructor(
    message = 'We received an unexpected response. Please try again.',
  ) {
    super(message);
    this.name = 'ApiResponseParseError';
  }
}

// --- Internal Helpers ---

function getAuthHeaders(): Record<string, string> {
  const token = getIdToken();
  if (!token) {
    throw new ApiAuthenticationError();
  }
  return { 'Authorization': `Bearer ${token}` };
}

async function handleErrorResponse(response: Response): Promise<never> {
  if (response.status === 401) {
    throw new ApiAuthenticationError();
  }

  const contentType = response.headers.get('content-type') ?? '';
  let errorMessage: string | null = null;

  if (contentType.includes('application/json')) {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'error' in body && typeof (body as Record<string, unknown>)['error'] === 'string') {
      errorMessage = (body as Record<string, unknown>)['error'] as string;
    }
  }

  if (response.status >= 500) {
    // eslint-disable-next-line no-console
    console.error(`API server error (${response.status}):`, errorMessage ?? response.statusText);
    throw new ApiServerError();
  }

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  throw new Error(`API request failed with status ${response.status}`);
}

async function apiRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const authHeaders = getAuthHeaders();
  const headers: Record<string, string> = { ...authHeaders, ...(options.headers as Record<string, string> | undefined) };

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('API network error:', err);
    throw new ApiNetworkError();
  }

  if (!response.ok) {
    await handleErrorResponse(response);
  }

  return response;
}

async function safeParseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('API response parse error:', err);
    throw new ApiResponseParseError();
  }
}

// --- Public API Functions ---

export async function listExpenses(filters?: ListExpensesFilters): Promise<Expense[]> {
  const params = new URLSearchParams();
  if (filters?.category) { params.set('category', filters.category); }
  if (filters?.startDate) { params.set('startDate', filters.startDate); }
  if (filters?.endDate) { params.set('endDate', filters.endDate); }

  const queryString = params.toString();
  const path = queryString ? `/expenses?${queryString}` : '/expenses';

  const response = await apiRequest(path, { method: 'GET' });
  const data: unknown = await safeParseJson(response);

  if (typeof data === 'object' && data !== null && 'expenses' in data && Array.isArray((data as Record<string, unknown>)['expenses'])) {
    return (data as { expenses: Expense[] }).expenses;
  }
  if (Array.isArray(data)) { return data as Expense[]; }
  return [];
}


export async function getExpense(id: string): Promise<Expense> {
  const response = await apiRequest(`/expenses/${encodeURIComponent(id)}`, { method: 'GET' });
  return (await safeParseJson(response)) as Expense;
}

export async function createExpense(data: ExpenseFormInput): Promise<Expense> {
  const body = { vendor: data.vendor, description: data.description, amount: data.amount, date: data.date, paidBy: data.paidBy, category: data.category, categoryConfidence: data.categoryConfidence };
  const response = await apiRequest('/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return (await safeParseJson(response)) as Expense;
}

export async function categorizeExpense(data: CategorizeInput): Promise<CategoryResult | null> {
  const response = await apiRequest('/categorize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vendor: data.vendor, description: data.description }) });
  const result: unknown = await safeParseJson(response);
  if (typeof result === 'object' && result !== null && 'result' in result && (result as Record<string, unknown>)['result'] === null) { return null; }
  return result as CategoryResult;
}

export async function reimburseExpense(id: string, reimbursedBy: string): Promise<Expense> {
  const response = await apiRequest(
    `/expenses/${encodeURIComponent(id)}/reimburse`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reimbursedBy }),
    },
  );
  return (await safeParseJson(response)) as Expense;
}

/**
 * Fetch reimbursement summaries for the dashboard.
 * Calls GET /dashboard/reimbursements.
 */
export async function getReimbursementSummaries(): Promise<ReimbursementSummary[]> {
  const response = await apiRequest('/dashboard/reimbursements', {
    method: 'GET',
  });
  const data: unknown = await safeParseJson(response);

  if (
    typeof data === 'object' &&
    data !== null &&
    'summaries' in data &&
    Array.isArray((data as Record<string, unknown>)['summaries'])
  ) {
    return (data as { summaries: ReimbursementSummary[] }).summaries;
  }

  if (Array.isArray(data)) {
    return data as ReimbursementSummary[];
  }

  return [];
}
