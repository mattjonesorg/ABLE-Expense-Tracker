/**
 * Stub Lambda handler for routes that are not yet implemented.
 * Returns 501 Not Implemented with a JSON body.
 *
 * Defense-in-depth (#19 security audit): validates auth context even though
 * the API Gateway JWT authorizer provides the primary auth check. This
 * ensures unauthenticated requests are rejected at the Lambda level too.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { extractAuthContext } from '../middleware/auth.js';

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const authResult = extractAuthContext(event);
  if (!authResult.success) {
    return authResult.response;
  }

  return {
    statusCode: 501,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' }),
  };
};
