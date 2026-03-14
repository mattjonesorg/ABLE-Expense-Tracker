import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ExpenseRepository } from '../../lib/dynamo.js';
import type { AuthResult } from '../../middleware/auth.js';
import type { ReimbursementSummary } from '../../lib/types.js';
import { createLogger, extractRequestId } from '../../lib/logger.js';

/**
 * Dependencies injected into the dashboard reimbursements handler.
 * Uses a factory pattern so tests can inject mocks.
 */
export interface DashboardReimbursementsHandlerDeps {
  repo: ExpenseRepository;
  authenticate: (event: APIGatewayProxyEventV2) => Promise<AuthResult>;
}

/**
 * Factory function that creates the Lambda handler for GET /dashboard/reimbursements.
 *
 * The handler:
 * 1. Authenticates the request using the injected auth middleware
 * 2. Fetches all unreimbursed expenses for the account
 * 3. Aggregates by paidBy: sums amount and counts expenses per payer
 * 4. Returns { summaries: ReimbursementSummary[] }
 */
export function createDashboardReimbursementsHandler(deps: DashboardReimbursementsHandlerDeps) {
  const log = createLogger('DashboardReimbursements');

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

    try {
      // 2. Fetch unreimbursed expenses
      const expenses = await deps.repo.listExpenses(context.accountId, { reimbursed: false });

      // 3. Aggregate by paidBy
      const byPayer = new Map<string, { totalOwed: number; expenseCount: number }>();

      for (const expense of expenses) {
        const existing = byPayer.get(expense.paidBy);
        if (existing) {
          existing.totalOwed += expense.amount;
          existing.expenseCount += 1;
        } else {
          byPayer.set(expense.paidBy, { totalOwed: expense.amount, expenseCount: 1 });
        }
      }

      // 4. Build summaries
      const summaries: ReimbursementSummary[] = [];
      for (const [paidBy, agg] of byPayer) {
        summaries.push({
          userId: paidBy,
          displayName: paidBy,
          totalOwed: agg.totalOwed,
          expenseCount: agg.expenseCount,
        });
      }

      log.info('Request completed', requestId, { statusCode: 200, summaryCount: summaries.length });
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ summaries }),
      };
    } catch (err: unknown) {
      const errorName = err instanceof Error ? err.name : 'UnknownError';
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error('Failed to fetch reimbursement summaries', requestId, { errorName, errorMessage });
      throw err;
    }
  };
}
