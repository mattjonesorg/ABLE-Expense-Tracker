import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ExpenseRepository } from '../../lib/dynamo.js';
import type { AuthResult } from '../../middleware/auth.js';
import type { ApiError, BulkReimburseResponse } from '../../lib/types.js';
import { createLogger, extractRequestId } from '../../lib/logger.js';

export interface ReimburseBulkHandlerDeps {
  repo: ExpenseRepository;
  authenticate: (event: APIGatewayProxyEventV2) => Promise<AuthResult>;
}

const MAX_EXPENSE_IDS = 100;
const MAX_REIMBURSED_BY_LENGTH = 200;

function errorResponse(statusCode: number, error: string, code: string, details?: unknown): APIGatewayProxyResultV2 {
  const body: ApiError = { error, code };
  if (details !== undefined) {
    body.details = details;
  }
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function jsonResponse(statusCode: number, data: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  };
}

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

export function createReimburseBulkHandler(deps: ReimburseBulkHandlerDeps) {
  const log = createLogger('ReimburseBulk');

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

    // 2. Parse and validate request body
    const body = parseBody(event);
    if (body === null) {
      log.warn('Invalid JSON body', requestId);
      return errorResponse(400, 'Request body must be valid JSON', 'INVALID_JSON');
    }

    // Validate expenseIds
    const rawIds = body['expenseIds'];
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      log.warn('Invalid expenseIds', requestId);
      return errorResponse(400, 'expenseIds must be a non-empty array', 'VALIDATION_ERROR');
    }

    if (rawIds.length > MAX_EXPENSE_IDS) {
      log.warn('Too many expenseIds', requestId, { count: rawIds.length });
      return errorResponse(400, `expenseIds must not exceed ${MAX_EXPENSE_IDS} items`, 'VALIDATION_ERROR');
    }

    const expenseIds = rawIds as string[];

    // Validate reimbursedBy
    if (typeof body['reimbursedBy'] !== 'string' || body['reimbursedBy'].trim().length === 0) {
      log.warn('Missing reimbursedBy', requestId);
      return errorResponse(400, 'reimbursedBy is required', 'VALIDATION_ERROR');
    }

    const reimbursedBy = body['reimbursedBy'] as string;

    if (reimbursedBy.length > MAX_REIMBURSED_BY_LENGTH) {
      log.warn('reimbursedBy too long', requestId);
      return errorResponse(400, `reimbursedBy must not exceed ${MAX_REIMBURSED_BY_LENGTH} characters`, 'VALIDATION_ERROR');
    }

    try {
      // 3. Fetch all expenses and validate state
      const expenses = await Promise.all(
        expenseIds.map((id) => deps.repo.getExpense(context.accountId, id)),
      );

      // Check for not found
      const notFoundIds: string[] = [];
      for (let i = 0; i < expenseIds.length; i++) {
        if (expenses[i] === null) {
          notFoundIds.push(expenseIds[i]);
        }
      }

      if (notFoundIds.length > 0) {
        log.info('Expenses not found', requestId, { statusCode: 404, notFoundIds });
        return errorResponse(404, 'One or more expenses not found', 'NOT_FOUND', { notFoundIds });
      }

      // Check for already reimbursed
      const alreadyReimbursedIds: string[] = [];
      for (let i = 0; i < expenseIds.length; i++) {
        if (expenses[i]!.reimbursed) {
          alreadyReimbursedIds.push(expenseIds[i]);
        }
      }

      if (alreadyReimbursedIds.length > 0) {
        log.warn('Expenses already reimbursed', requestId, { alreadyReimbursedIds });
        return errorResponse(409, 'One or more expenses are already reimbursed', 'ALREADY_REIMBURSED', { alreadyReimbursedIds });
      }

      // 4. Bulk mark as reimbursed
      const validExpenses = expenses.filter((e): e is NonNullable<typeof e> => e !== null);
      const updated = await deps.repo.markReimbursedBulk(context.accountId, validExpenses);

      // 5. Return response
      const response: BulkReimburseResponse = {
        expenses: updated,
        count: updated.length,
      };

      log.info('Request completed', requestId, { statusCode: 200, count: updated.length });
      return jsonResponse(200, response);
    } catch (err: unknown) {
      const errorName = err instanceof Error ? err.name : 'UnknownError';
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error('Failed to bulk reimburse expenses', requestId, { errorName, errorMessage });
      throw err;
    }
  };
}
