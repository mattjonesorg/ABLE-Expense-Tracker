import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { CategoryResult } from '../../lib/types.js';
import type { CategorizationInput } from '../../lib/claude.js';
import type { AuthResult } from '../../middleware/auth.js';
import { createLogger, extractRequestId } from '../../lib/logger.js';

/**
 * Dependencies injected into the categorize handler.
 * Enables testing without real Anthropic API or Cognito.
 */
interface CategorizeHandlerDeps {
  categorize: (input: CategorizationInput) => Promise<CategoryResult | null>;
  authenticate: (event: APIGatewayProxyEventV2) => Promise<AuthResult>;
}

/**
 * Build a JSON response with standard headers.
 */
function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** Maximum allowed amount in cents ($100,000). Consistent with create handler (#45). */
const MAX_AMOUNT_CENTS = 10_000_000;

/**
 * Result of parsing the categorize request body.
 */
type ParseResult =
  | { success: true; input: CategorizationInput }
  | { success: false; error: string };

/**
 * Validate that the request body contains the required fields.
 * Returns the parsed input or an error message.
 */
function parseBody(body: string | null | undefined): ParseResult {
  if (!body) {
    return { success: false, error: 'Missing required fields: vendor and description' };
  }

  try {
    const parsed: unknown = JSON.parse(body);

    if (typeof parsed !== 'object' || parsed === null) {
      return { success: false, error: 'Missing required fields: vendor and description' };
    }

    const obj = parsed as Record<string, unknown>;

    if (typeof obj['vendor'] !== 'string' || obj['vendor'].length === 0) {
      return { success: false, error: 'Missing required fields: vendor and description' };
    }

    if (typeof obj['description'] !== 'string' || obj['description'].length === 0) {
      return { success: false, error: 'Missing required fields: vendor and description' };
    }

    // Amount defaults to 0 if not provided (still valid for categorization)
    let amount = 0;
    if (obj['amount'] !== undefined && obj['amount'] !== null) {
      if (typeof obj['amount'] !== 'number' || !Number.isFinite(obj['amount']) || !Number.isInteger(obj['amount'])) {
        return { success: false, error: 'amount must be a non-negative integer (cents)' };
      }
      if ((obj['amount'] as number) < 0) {
        return { success: false, error: 'amount must be a non-negative integer (cents)' };
      }
      if ((obj['amount'] as number) > MAX_AMOUNT_CENTS) {
        return { success: false, error: `amount must not exceed ${MAX_AMOUNT_CENTS} cents ($100,000)` };
      }
      amount = obj['amount'] as number;
    }

    return {
      success: true,
      input: {
        vendor: obj['vendor'] as string,
        description: obj['description'] as string,
        amount,
      },
    };
  } catch {
    return { success: false, error: 'Missing required fields: vendor and description' };
  }
}

/**
 * Creates a Lambda handler for expense categorization.
 *
 * The handler:
 * 1. Authenticates the request via the injected authenticate function
 * 2. Validates the request body (vendor, description required)
 * 3. Calls the categorizer with the expense data
 * 4. Returns the categorization result (or null on graceful degradation)
 *
 * @param deps - Injected dependencies (categorizer and auth middleware)
 * @returns Lambda handler function
 */
export function createCategorizeHandler(
  deps: CategorizeHandlerDeps,
): (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2> {
  const log = createLogger('CategorizeExpense');

  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    const requestId = extractRequestId(event as unknown as Record<string, unknown>);
    log.info('Request started', requestId);

    // Step 1: Authenticate
    const authResult = await deps.authenticate(event);
    if (!authResult.success) {
      log.warn('Authentication failed', requestId);
      return authResult.response;
    }

    // Step 2: Validate input
    const parsed = parseBody(event.body);
    if (!parsed.success) {
      log.warn('Validation failed', requestId, { error: parsed.error });
      return jsonResponse(400, {
        error: parsed.error,
        code: 'VALIDATION_ERROR',
      });
    }

    // Step 3: Categorize
    try {
      const result = await deps.categorize(parsed.input);

      // Step 4: Return result (null is a valid response — graceful degradation)
      if (result === null) {
        log.info('Request completed — categorization returned null (graceful degradation)', requestId, { statusCode: 200 });
        return jsonResponse(200, { result: null });
      }

      log.info('Request completed', requestId, { statusCode: 200, category: result.category });
      return jsonResponse(200, result);
    } catch (err: unknown) {
      const errorName = err instanceof Error ? err.name : 'UnknownError';
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error('Categorization failed', requestId, { errorName, errorMessage });
      throw err;
    }
  };
}
