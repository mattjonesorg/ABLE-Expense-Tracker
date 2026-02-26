import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ExpenseRepository } from '../../lib/dynamo.js';
import type { AuthResult } from '../../middleware/auth.js';
import type { AbleCategory, CreateExpenseInput, ApiError } from '../../lib/types.js';
import { ABLE_CATEGORIES } from '../../lib/types.js';

/**
 * Dependencies injected into the create expense handler.
 * Uses a factory pattern so tests can inject mocks.
 */
export interface CreateHandlerDeps {
  repo: ExpenseRepository;
  authenticate: (event: APIGatewayProxyEventV2) => Promise<AuthResult>;
}

/**
 * Shape of the JSON request body for creating an expense.
 * All fields from CreateExpenseInput except accountId and submittedBy,
 * which are derived from the authenticated user context.
 */
interface CreateExpenseRequestBody {
  date: string;
  vendor: string;
  description: string;
  amount: number;
  category: AbleCategory;
  categoryConfidence: 'ai_confirmed' | 'ai_suggested' | 'user_selected';
  categoryNotes: string;
  receiptKey: string | null;
  paidBy: string;
}

/** Date format regex: YYYY-MM-DD */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Build a JSON error response with the ApiError format.
 */
function errorResponse(statusCode: number, error: string, code: string): APIGatewayProxyResultV2 {
  const body: ApiError = { error, code };
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * Build a JSON success response.
 */
function jsonResponse(statusCode: number, data: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  };
}

/**
 * Parse the event body as JSON, returning the parsed object or null on failure.
 */
function parseBody(event: APIGatewayProxyEventV2): Record<string, unknown> | null {
  if (!event.body) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(event.body);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Validate the request body and return either the validated body or an error message.
 */
function validateBody(
  body: Record<string, unknown>,
): { valid: true; data: CreateExpenseRequestBody } | { valid: false; error: string } {
  // Required string fields
  if (typeof body['vendor'] !== 'string' || body['vendor'].trim().length === 0) {
    return { valid: false, error: 'vendor is required' };
  }

  if (typeof body['date'] !== 'string' || body['date'].trim().length === 0) {
    return { valid: false, error: 'date is required' };
  }

  if (!DATE_REGEX.test(body['date'] as string)) {
    return { valid: false, error: 'date must be in YYYY-MM-DD format' };
  }

  // Amount validation
  if (body['amount'] === undefined || body['amount'] === null) {
    return { valid: false, error: 'amount is required' };
  }

  if (typeof body['amount'] !== 'number' || !Number.isInteger(body['amount'])) {
    return { valid: false, error: 'amount must be a positive integer (cents)' };
  }

  if ((body['amount'] as number) <= 0) {
    return { valid: false, error: 'amount must be a positive integer (cents)' };
  }

  // Date must not be in the future
  const dateStr = body['date'] as string;
  const expenseDate = new Date(dateStr + 'T00:00:00.000Z');
  const today = new Date();
  // Compare date-only (strip time from today)
  const todayDateOnly = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  if (expenseDate.getTime() > todayDateOnly.getTime()) {
    return { valid: false, error: 'date must not be in the future' };
  }

  // Category validation (optional but if provided must be valid)
  if (body['category'] !== undefined) {
    if (!(ABLE_CATEGORIES as readonly string[]).includes(body['category'] as string)) {
      return { valid: false, error: 'category must be a valid ABLE category' };
    }
  }

  return {
    valid: true,
    data: {
      date: body['date'] as string,
      vendor: (body['vendor'] as string).trim(),
      description: typeof body['description'] === 'string' ? body['description'] : '',
      amount: body['amount'] as number,
      category: (body['category'] ?? 'Basic living expenses') as AbleCategory,
      categoryConfidence: (body['categoryConfidence'] ?? 'user_selected') as CreateExpenseRequestBody['categoryConfidence'],
      categoryNotes: typeof body['categoryNotes'] === 'string' ? body['categoryNotes'] : '',
      receiptKey: typeof body['receiptKey'] === 'string' ? body['receiptKey'] : null,
      paidBy: typeof body['paidBy'] === 'string' ? body['paidBy'] : '',
    },
  };
}

/**
 * Factory function that creates the Lambda handler for POST /expenses.
 *
 * The handler:
 * 1. Authenticates the request using the injected auth middleware
 * 2. Parses and validates the JSON request body
 * 3. Enforces business rules (positive amount, date not in the future)
 * 4. Delegates to ExpenseRepository.createExpense
 * 5. Returns 201 with the created expense
 */
export function createCreateExpenseHandler(deps: CreateHandlerDeps) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    // 1. Authenticate
    const authResult = await deps.authenticate(event);
    if (!authResult.success) {
      return authResult.response;
    }
    const { context } = authResult;

    // 2. Parse the JSON body
    const body = parseBody(event);
    if (body === null) {
      return errorResponse(400, 'Request body must be valid JSON', 'INVALID_JSON');
    }

    // 3. Validate fields and business rules
    const validation = validateBody(body);
    if (!validation.valid) {
      return errorResponse(400, validation.error, 'VALIDATION_ERROR');
    }

    const { data } = validation;

    // 4. Build the CreateExpenseInput with auth-derived fields
    const input: CreateExpenseInput = {
      accountId: context.accountId,
      submittedBy: context.userId,
      date: data.date,
      vendor: data.vendor,
      description: data.description,
      amount: data.amount,
      category: data.category,
      categoryConfidence: data.categoryConfidence,
      categoryNotes: data.categoryNotes,
      receiptKey: data.receiptKey,
      paidBy: data.paidBy,
    };

    // 5. Create the expense via the repository
    const expense = await deps.repo.createExpense(input);

    // 6. Return 201 with the created expense
    return jsonResponse(201, expense);
  };
}
