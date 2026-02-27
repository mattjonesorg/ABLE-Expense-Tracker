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
 * Required claims that must be present and non-empty in the JWT token.
 */
const REQUIRED_CLAIMS = ['sub', 'email', 'custom:accountId', 'custom:role'] as const;

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
      return unauthorized('Unauthorized');
    }

    if (!authHeader.startsWith('Bearer ')) {
      return unauthorized('Unauthorized');
    }

    const token = authHeader.slice('Bearer '.length);

    if (token.length === 0) {
      return unauthorized('Unauthorized');
    }

    try {
      const claims = await verifyToken(token);

      // Validate role claim is present and valid
      const role = claims['custom:role'];
      if (!role || !VALID_ROLES.has(role)) {
        // #43: Generic error — do not reveal which claim failed
        return forbidden('Forbidden');
      }

      // Validate accountId claim is present and non-empty
      const accountId = claims['custom:accountId'];
      if (!accountId) {
        // #43: Generic error — do not reveal which claim failed
        return forbidden('Forbidden');
      }

      const context: AuthContext = {
        userId: claims.sub,
        accountId,
        email: claims.email,
        displayName: claims['custom:displayName'],
        role: role as AuthContext['role'],
      };

      return { success: true, context };
    } catch {
      // #43: Generic error — do not leak verifier details (token expired, invalid signature, etc.)
      return unauthorized('Unauthorized');
    }
  };
}

/**
 * Build a standardized 401 response with the { message: 'Unauthorized' } format
 * expected by issue #63 for defense-in-depth auth enforcement.
 */
function unauthorizedResponse(): AuthResult {
  return {
    success: false,
    response: {
      statusCode: 401,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: 'Unauthorized' }),
    },
  };
}

/**
 * Shape of the API Gateway HTTP API JWT authorizer context.
 * This is what API Gateway populates when a JWT authorizer is configured.
 */
interface JwtAuthorizerContext {
  jwt?: {
    claims?: Record<string, string>;
    scopes?: string[];
  };
}

/**
 * Defense-in-depth auth enforcement: extracts and validates the authenticated
 * user context from the API Gateway HTTP API JWT authorizer.
 *
 * In production, API Gateway validates the JWT token and populates
 * `event.requestContext.authorizer.jwt.claims`. This function validates
 * that the authorizer context exists and contains all required claims,
 * providing a second layer of auth enforcement at the Lambda level.
 *
 * Required claims: sub, email, custom:accountId, custom:role
 *
 * Returns an AuthResult discriminated union:
 * - On success: { success: true, context: AuthContext }
 * - On failure: { success: false, response: { statusCode: 401, ... } }
 *
 * @param event - API Gateway v2 event with optional JWT authorizer context
 * @returns AuthResult with the authenticated context or a 401 response
 */
export function extractAuthContext(event: APIGatewayProxyEventV2): AuthResult {
  // The base APIGatewayEventRequestContextV2 type does not include authorizer,
  // because it only exists when a JWT/Lambda/IAM authorizer is configured.
  // We safely access it via a type assertion since this is defense-in-depth:
  // if the authorizer isn't configured, we correctly return 401.
  // Cast through unknown since the base request context type doesn't include authorizer
  const requestContext = event.requestContext as unknown as Record<string, unknown>;
  const authorizer = requestContext['authorizer'] as JwtAuthorizerContext | undefined;

  if (!authorizer) {
    return unauthorizedResponse();
  }

  // Check that the JWT claims object exists
  const jwt = authorizer.jwt;
  if (!jwt || !jwt.claims) {
    return unauthorizedResponse();
  }

  const claims = jwt.claims;

  // Validate all required claims are present and non-empty
  for (const claim of REQUIRED_CLAIMS) {
    const value = claims[claim];
    if (!value || value.trim().length === 0) {
      return unauthorizedResponse();
    }
  }

  // Validate role is a recognized value
  const role = claims['custom:role'];
  if (!VALID_ROLES.has(role)) {
    return unauthorizedResponse();
  }

  // Build the authenticated context
  const context: AuthContext = {
    userId: claims['sub'],
    accountId: claims['custom:accountId'],
    email: claims['email'],
    displayName: claims['custom:displayName'] ?? '',
    role: role as AuthContext['role'],
  };

  return { success: true, context };
}
