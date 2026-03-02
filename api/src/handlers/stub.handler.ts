/**
 * Stub Lambda handler for routes that are not yet implemented.
 * Returns 501 Not Implemented with a JSON body.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

export const handler = async (
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => ({
  statusCode: 501,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' }),
});
