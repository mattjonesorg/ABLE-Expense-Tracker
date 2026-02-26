import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { CategoryResult } from '../../lib/types.js';
import type { CategorizationInput } from '../../lib/claude.js';
import type { AuthResult } from '../../middleware/auth.js';

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

/**
 * Validate that the request body contains the required fields.
 * Returns the parsed input or null if invalid.
 */
function parseBody(body: string | null | undefined): CategorizationInput | null {
  if (!body) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(body);

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const obj = parsed as Record<string, unknown>;

    if (typeof obj['vendor'] !== 'string' || obj['vendor'].length === 0) {
      return null;
    }

    if (typeof obj['description'] !== 'string' || obj['description'].length === 0) {
      return null;
    }

    // Amount defaults to 0 if not provided (still valid)
    const amount = typeof obj['amount'] === 'number' ? obj['amount'] : 0;

    return {
      vendor: obj['vendor'] as string,
      description: obj['description'] as string,
      amount,
    };
  } catch {
    return null;
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
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    // Step 1: Authenticate
    const authResult = await deps.authenticate(event);
    if (!authResult.success) {
      return authResult.response;
    }

    // Step 2: Validate input
    const input = parseBody(event.body);
    if (!input) {
      return jsonResponse(400, {
        error: 'Missing required fields: vendor and description',
        code: 'VALIDATION_ERROR',
      });
    }

    // Step 3: Categorize
    const result = await deps.categorize(input);

    // Step 4: Return result (null is a valid response — graceful degradation)
    if (result === null) {
      return jsonResponse(200, { result: null });
    }

    return jsonResponse(200, result);
  };
}
