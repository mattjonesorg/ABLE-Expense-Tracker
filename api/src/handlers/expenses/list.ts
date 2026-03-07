import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ExpenseRepository } from '../../lib/dynamo.js';
import type { AuthResult } from '../../middleware/auth.js';
import type { AbleCategory, ApiError, Expense } from '../../lib/types.js';
import { ABLE_CATEGORIES } from '../../lib/types.js';
import { createLogger, extractRequestId } from '../../lib/logger.js';

/**
 * Dependencies injected into the list expenses handler.
 * Uses a factory pattern so tests can inject mocks.
 */
export interface ListHandlerDeps {
  repo: ExpenseRepository;
  authenticate: (event: APIGatewayProxyEventV2) => Promise<AuthResult>;
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
 * Factory function that creates the Lambda handler for GET /expenses.
 *
 * The handler:
 * 1. Authenticates the request using the injected auth middleware
 * 2. Validates optional query parameters (category, startDate, endDate, limit)
 * 3. Delegates to the appropriate repository method
 * 4. Applies client-side date filtering and limit
 * 5. Returns 200 with the expenses array
 */
export function createListExpensesHandler(deps: ListHandlerDeps) {
  const log = createLogger('ListExpenses');

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

    // 2. Extract and validate query parameters
    const queryParams = event.queryStringParameters ?? {};
    const category = queryParams['category'];
    const startDate = queryParams['startDate'];
    const endDate = queryParams['endDate'];
    const limitStr = queryParams['limit'];
    const reimbursedStr = queryParams['reimbursed'];

    // Validate category if provided
    if (category !== undefined) {
      if (!(ABLE_CATEGORIES as readonly string[]).includes(category)) {
        log.warn('Invalid category filter', requestId, { category });
        return errorResponse(400, 'category must be a valid ABLE category', 'VALIDATION_ERROR');
      }
    }

    // Validate date formats
    if (startDate !== undefined && !DATE_REGEX.test(startDate)) {
      log.warn('Invalid startDate format', requestId);
      return errorResponse(400, 'startDate must be in YYYY-MM-DD format', 'VALIDATION_ERROR');
    }

    if (endDate !== undefined && !DATE_REGEX.test(endDate)) {
      log.warn('Invalid endDate format', requestId);
      return errorResponse(400, 'endDate must be in YYYY-MM-DD format', 'VALIDATION_ERROR');
    }

    // Validate limit
    let limit: number | undefined;
    if (limitStr !== undefined) {
      limit = Number(limitStr);
      if (!Number.isInteger(limit) || limit <= 0) {
        log.warn('Invalid limit', requestId, { limit: limitStr });
        return errorResponse(400, 'limit must be a positive integer', 'VALIDATION_ERROR');
      }
    }

    // Validate reimbursed
    let reimbursed: boolean | undefined;
    if (reimbursedStr !== undefined) {
      if (reimbursedStr !== 'true' && reimbursedStr !== 'false') {
        log.warn('Invalid reimbursed filter', requestId);
        return errorResponse(400, 'reimbursed must be "true" or "false"', 'VALIDATION_ERROR');
      }
      reimbursed = reimbursedStr === 'true';
    }

    try {
      // 3. Fetch expenses from the repository
      const filters = reimbursed !== undefined ? { reimbursed } : undefined;
      let expenses: Expense[];
      if (category !== undefined) {
        expenses = await deps.repo.listExpensesByCategory(
          context.accountId,
          category as AbleCategory,
        );
      } else {
        expenses = await deps.repo.listExpenses(context.accountId, filters);
      }

      // 4. Apply client-side filters
      if (startDate !== undefined) {
        expenses = expenses.filter((e) => e.date >= startDate);
      }

      if (endDate !== undefined) {
        expenses = expenses.filter((e) => e.date <= endDate);
      }

      if (reimbursed !== undefined) {
        expenses = expenses.filter((e) => e.reimbursed === reimbursed);
      }

      // 5. Apply limit
      if (limit !== undefined) {
        expenses = expenses.slice(0, limit);
      }

      // 6. Return response
      log.info('Request completed', requestId, { statusCode: 200, count: expenses.length });
      return jsonResponse(200, { expenses });
    } catch (err: unknown) {
      const errorName = err instanceof Error ? err.name : 'UnknownError';
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error('Failed to list expenses', requestId, { errorName, errorMessage });
      throw err;
    }
  };
}
