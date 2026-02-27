/**
 * API client for ABLE Tracker.
 * Makes real fetch calls to the deployed API Gateway endpoints.
 * All requests require an authenticated user (Bearer token).
 *
 * Replaces the previous mock implementation as part of issue #54.
 */

import type { Expense, AbleCategory, CategoryResult } from './types';
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
  constructor(message = 'Authentication required. Please log in.') {
    super(message);
    this.name = 'ApiAuthenticationError';
  }
}

// --- Internal Helpers ---

/**
 * Get the authorization headers for API requests.
 * Throws ApiAuthenticationError if no token is available.
 */
function getAuthHeaders(): Record<string, string> {
  const token = getIdToken();
  if (!token) {
    throw new ApiAuthenticationError();
  }
  return {
    'Authorization': `Bearer ${token}`,
  };
}

/**
 * Parse an API error response and throw an appropriate error.
 * Handles JSON error bodies with `{ error, code }` format and
 * falls back to status text for non-JSON responses.
 */
async function handleErrorResponse(response: Response): Promise<never> {
  if (response.status === 401) {
    throw new ApiAuthenticationError();
  }

  // Try to parse JSON error body
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as Record<string, unknown>)['error'] === 'string'
    ) {
      throw new Error((body as Record<string, unknown>)['error'] as string);
    }
  }

  // Fallback for non-JSON responses
  throw new Error(`API request failed with status ${response.status}`);
}

/**
 * Make an authenticated API request.
 * Automatically adds the Authorization header and handles errors.
 */
async function apiRequest(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const authHeaders = getAuthHeaders();
  const headers: Record<string, string> = {
    ...authHeaders,
    ...(options.headers as Record<string, string> | undefined),
  };

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    await handleErrorResponse(response);
  }

  return response;
}

// --- Public API Functions ---

/**
 * Fetch the list of expenses, optionally filtered by category and date range.
 * Calls GET /expenses with query parameters.
 */
export async function listExpenses(
  filters?: ListExpensesFilters,
): Promise<Expense[]> {
  const params = new URLSearchParams();

  if (filters?.category) {
    params.set('category', filters.category);
  }
  if (filters?.startDate) {
    params.set('startDate', filters.startDate);
  }
  if (filters?.endDate) {
    params.set('endDate', filters.endDate);
  }

  const queryString = params.toString();
  const path = queryString ? `/expenses?${queryString}` : '/expenses';

  const response = await apiRequest(path, { method: 'GET' });
  const data: unknown = await response.json();

  // The API returns { expenses: Expense[] }
  if (
    typeof data === 'object' &&
    data !== null &&
    'expenses' in data &&
    Array.isArray((data as Record<string, unknown>)['expenses'])
  ) {
    return (data as { expenses: Expense[] }).expenses;
  }

  // Fallback: if the response is an array directly
  if (Array.isArray(data)) {
    return data as Expense[];
  }

  return [];
}

/**
 * Fetch a single expense by ID.
 * Calls GET /expenses/{id}.
 */
export async function getExpense(id: string): Promise<Expense> {
  const response = await apiRequest(`/expenses/${encodeURIComponent(id)}`, {
    method: 'GET',
  });
  return (await response.json()) as Expense;
}

/**
 * Create a new expense.
 * Calls POST /expenses with a JSON body.
 * Note: receiptFile is not sent in this request; receipt upload is handled separately.
 */
export async function createExpense(data: ExpenseFormInput): Promise<Expense> {
  const body = {
    vendor: data.vendor,
    description: data.description,
    amount: data.amount,
    date: data.date,
    paidBy: data.paidBy,
    category: data.category,
    categoryConfidence: data.categoryConfidence,
  };

  const response = await apiRequest('/expenses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return (await response.json()) as Expense;
}

/**
 * Categorize an expense using AI.
 * Calls POST /categorize with vendor and description.
 * Returns null when the API returns a graceful degradation response.
 */
export async function categorizeExpense(
  data: CategorizeInput,
): Promise<CategoryResult | null> {
  const response = await apiRequest('/categorize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      vendor: data.vendor,
      description: data.description,
    }),
  });

  const result: unknown = await response.json();

  // Handle graceful degradation: { result: null }
  if (
    typeof result === 'object' &&
    result !== null &&
    'result' in result &&
    (result as Record<string, unknown>)['result'] === null
  ) {
    return null;
  }

  return result as CategoryResult;
}

/**
 * Mark an expense as reimbursed.
 * Calls POST /expenses/{id}/reimburse.
 */
export async function reimburseExpense(id: string): Promise<Expense> {
  const response = await apiRequest(
    `/expenses/${encodeURIComponent(id)}/reimburse`,
    {
      method: 'POST',
    },
  );

  return (await response.json()) as Expense;
}
