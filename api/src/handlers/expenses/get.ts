import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ExpenseRepository } from '../../lib/dynamo.js';
import type { AuthResult } from '../../middleware/auth.js';
import type { ApiError } from '../../lib/types.js';
import { createLogger, extractRequestId } from '../../lib/logger.js';

/**
 * Dependencies injected into the get expense handler.
 * Uses a factory pattern so tests can inject mocks.
 */
export interface GetHandlerDeps {
  repo: ExpenseRepository;
  authenticate: (event: APIGatewayProxyEventV2) => Promise<AuthResult>;
}

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
 * Factory function that creates the Lambda handler for GET /expenses/{id}.
 *
 * The handler:
 * 1. Authenticates the request using the injected auth middleware
 * 2. Extracts and validates the expense ID from path parameters
 * 3. Delegates to ExpenseRepository.getExpense
 * 4. Returns 404 if not found, 200 with the expense otherwise
 */
export function createGetExpenseHandler(deps: GetHandlerDeps) {
  const log = createLogger('GetExpense');

  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    const requestId = extractRequestId(event as unknown as Record<string, unknown>);
    log.info('Request started', requestId);

    // 1. Authenticate
    const authResult = await deps.authenticate(event);
    if (!authResult.success) {
      log.warn('Authentication failed', requestId);
      return authResult.response;
    }
    const { context } = authResult;

    // 2. Extract expense ID from path parameters
    const expenseId = event.pathParameters?.['id'];
    if (!expenseId || expenseId.trim().length === 0) {
      log.warn('Missing expense ID', requestId);
      return errorResponse(400, 'Expense id is required', 'VALIDATION_ERROR');
    }

    try {
      // 3. Fetch expense from the repository
      const expense = await deps.repo.getExpense(context.accountId, expenseId);

      // 4. Return 404 if not found
      if (expense === null) {
        log.info('Expense not found', requestId, { statusCode: 404, expenseId });
        return errorResponse(404, 'Expense not found', 'NOT_FOUND');
      }

      // 5. Return the expense
      log.info('Request completed', requestId, { statusCode: 200, expenseId });
      return jsonResponse(200, expense);
    } catch (err: unknown) {
      const errorName = err instanceof Error ? err.name : 'UnknownError';
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error('Failed to get expense', requestId, { errorName, errorMessage, expenseId });
      throw err;
    }
  };
}
