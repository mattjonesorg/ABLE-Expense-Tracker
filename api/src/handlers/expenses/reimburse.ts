import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ExpenseRepository } from '../../lib/dynamo.js';
import type { AuthResult } from '../../middleware/auth.js';
import type { ApiError } from '../../lib/types.js';

/**
 * Dependencies injected into the reimburse expense handler.
 * Uses a factory pattern so tests can inject mocks.
 */
export interface ReimburseHandlerDeps {
  repo: ExpenseRepository;
  authenticate: (event: APIGatewayProxyEventV2) => Promise<AuthResult>;
}

/** Maximum allowed length for the reimbursedBy field. */
const MAX_REIMBURSED_BY_LENGTH = 200;

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
 * Factory function that creates the Lambda handler for PUT /expenses/{id}/reimburse.
 *
 * The handler:
 * 1. Authenticates the request using the injected auth middleware
 * 2. Extracts and validates the expense ID from path parameters
 * 3. Parses and validates the JSON request body (requires reimbursedBy)
 * 4. Fetches the expense and checks it exists and is not already reimbursed
 * 5. Delegates to ExpenseRepository.markReimbursed
 * 6. Returns 200 with the updated expense
 */
export function createReimburseExpenseHandler(deps: ReimburseHandlerDeps) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    // 1. Authenticate
    const authResult = await deps.authenticate(event);
    if (!authResult.success) {
      return authResult.response;
    }
    const { context } = authResult;

    // 2. Extract expense ID from path parameters
    const expenseId = event.pathParameters?.['id'];
    if (!expenseId || expenseId.trim().length === 0) {
      return errorResponse(400, 'Expense id is required', 'VALIDATION_ERROR');
    }

    // 3. Parse and validate request body
    const body = parseBody(event);
    if (body === null) {
      return errorResponse(400, 'Request body must be valid JSON', 'INVALID_JSON');
    }

    if (typeof body['reimbursedBy'] !== 'string' || body['reimbursedBy'].trim().length === 0) {
      return errorResponse(400, 'reimbursedBy is required', 'VALIDATION_ERROR');
    }

    const reimbursedBy = body['reimbursedBy'] as string;

    if (reimbursedBy.length > MAX_REIMBURSED_BY_LENGTH) {
      return errorResponse(400, `reimbursedBy must not exceed ${MAX_REIMBURSED_BY_LENGTH} characters`, 'VALIDATION_ERROR');
    }

    // 4. Fetch expense and validate state
    const expense = await deps.repo.getExpense(context.accountId, expenseId);
    if (expense === null) {
      return errorResponse(404, 'Expense not found', 'NOT_FOUND');
    }

    if (expense.reimbursed) {
      return errorResponse(409, 'Expense is already reimbursed', 'ALREADY_REIMBURSED');
    }

    // 5. Build the SK from the expense data and mark as reimbursed
    const sk = `EXP#${expense.date}#${expense.expenseId}`;
    const updated = await deps.repo.markReimbursed(
      context.accountId,
      expenseId,
      sk,
      expense.paidBy,
    );

    // 6. Return the updated expense
    return jsonResponse(200, updated);
  };
}
