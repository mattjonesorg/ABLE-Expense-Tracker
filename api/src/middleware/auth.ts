import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

/**
 * Cognito JWT token claims structure.
 * Maps to Cognito user pool custom attributes.
 */
export interface TokenClaims {
  sub: string;
  email: string;
  'custom:accountId': string;
  'custom:displayName': string;
  'custom:role': string;
}

/**
 * Authenticated user context extracted from a verified JWT.
 */
export interface AuthContext {
  userId: string;
  accountId: string;
  email: string;
  displayName: string;
  role: 'owner' | 'authorized_rep';
}

/**
 * Function signature for token verification.
 * Accepts a raw JWT string and returns decoded claims.
 * Throws on verification failure (expired, invalid signature, etc.).
 */
export type TokenVerifier = (token: string) => Promise<TokenClaims>;

/**
 * Discriminated union for auth middleware results.
 * On success, provides the authenticated user context.
 * On failure, provides a ready-to-return API Gateway error response.
 */
export type AuthResult =
  | { success: true; context: AuthContext }
  | { success: false; response: APIGatewayProxyResultV2 };

/**
 * Valid role values for ABLE Tracker users.
 */
const VALID_ROLES: ReadonlySet<string> = new Set(['owner', 'authorized_rep']);

/**
 * Build a standardized 401 error response.
 */
function unauthorized(error: string): AuthResult {
  return {
    success: false,
    response: {
      statusCode: 401,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ error, code: 'UNAUTHORIZED' }),
    },
  };
}

/**
 * Build a standardized 403 error response.
 */
function forbidden(error: string): AuthResult {
  return {
    success: false,
    response: {
      statusCode: 403,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ error, code: 'FORBIDDEN' }),
    },
  };
}

/**
 * Creates an auth middleware function that verifies JWT tokens
 * from the Authorization header using a pluggable token verifier.
 *
 * The dependency-injected verifier pattern allows:
 * - Easy testing without real Cognito JWKS endpoints
 * - Swapping verification strategies (e.g., local dev vs production)
 *
 * @param verifyToken - Function that verifies and decodes a JWT string
 * @returns Middleware function that processes API Gateway events
 */
export function createAuthMiddleware(
  verifyToken: TokenVerifier,
): (event: APIGatewayProxyEventV2) => Promise<AuthResult> {
  return async (event: APIGatewayProxyEventV2): Promise<AuthResult> => {
    // API Gateway v2 lowercases all header names, but handle mixed case for robustness
    const authHeader =
      event.headers['authorization'] ?? event.headers['Authorization'];

    if (!authHeader) {
      return unauthorized('Missing Authorization header');
    }

    if (!authHeader.startsWith('Bearer ')) {
      return unauthorized('Invalid Authorization header format');
    }

    const token = authHeader.slice('Bearer '.length);

    if (token.length === 0) {
      return unauthorized('Invalid Authorization header format');
    }

    try {
      const claims = await verifyToken(token);

      // Validate role claim is present and valid
      const role = claims['custom:role'];
      if (!role || !VALID_ROLES.has(role)) {
        return forbidden('Invalid role claim');
      }

      // Validate accountId claim is present and non-empty
      const accountId = claims['custom:accountId'];
      if (!accountId) {
        return forbidden('Missing accountId claim');
      }

      const context: AuthContext = {
        userId: claims.sub,
        accountId,
        email: claims.email,
        displayName: claims['custom:displayName'],
        role: role as AuthContext['role'],
      };

      return { success: true, context };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Token verification failed';
      return unauthorized(message);
    }
  };
}
