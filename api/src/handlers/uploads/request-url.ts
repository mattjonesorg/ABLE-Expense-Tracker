import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { AuthResult } from '../../middleware/auth.js';
import { ulid } from 'ulid';

/**
 * Allowed image MIME types and their corresponding file extensions.
 */
const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Maximum presigned URL TTL in seconds (15 minutes).
 */
const PRESIGNED_URL_TTL = 900;

/**
 * Dependencies injected into the upload URL handler.
 * This enables easy testing without real AWS infrastructure.
 */
export interface UploadHandlerDeps {
  /** Authenticate the incoming API Gateway event and return user context or error. */
  authenticate: (event: APIGatewayProxyEventV2) => Promise<AuthResult>;
  /** Generate a presigned S3 upload URL. */
  getSignedUrl: (
    bucketName: string,
    key: string,
    contentType: string,
    expiresIn: number,
  ) => Promise<string>;
  /** The S3 bucket name for receipt storage. */
  bucketName: string;
}

/**
 * Build an error response with consistent JSON format.
 */
function errorResponse(
  statusCode: number,
  error: string,
  code: string,
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error, code }),
  };
}

/**
 * Build a success response with consistent JSON format.
 */
function successResponse(data: Record<string, unknown>): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  };
}

/**
 * Request body schema for the upload URL endpoint.
 */
interface UploadRequestBody {
  contentType?: string;
}

/**
 * Creates a Lambda handler that generates presigned S3 URLs for receipt uploads.
 *
 * The handler:
 * 1. Authenticates the request via injected auth middleware
 * 2. Validates the requested content type is an allowed image format
 * 3. Generates a scoped S3 key: receipts/<accountId>/<ulid>.<ext>
 * 4. Returns a presigned PUT URL with a 15-minute TTL
 *
 * @param deps - Injectable dependencies for testability
 * @returns API Gateway v2 handler function
 */
export function createUploadUrlHandler(
  deps: UploadHandlerDeps,
): (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2> {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    // Step 1: Authenticate
    const authResult = await deps.authenticate(event);

    if (!authResult.success) {
      return authResult.response;
    }

    const { accountId } = authResult.context;

    // Step 2: Parse request body
    let requestBody: UploadRequestBody;
    try {
      requestBody = event.body ? (JSON.parse(event.body) as UploadRequestBody) : {};
    } catch {
      return errorResponse(400, 'Invalid JSON in request body', 'INVALID_BODY');
    }

    // Step 3: Validate contentType is present
    const { contentType } = requestBody;
    if (!contentType) {
      return errorResponse(
        400,
        'Missing required field: contentType',
        'MISSING_CONTENT_TYPE',
      );
    }

    // Step 4: Validate contentType is an allowed image type
    const extension = ALLOWED_CONTENT_TYPES[contentType];
    if (!extension) {
      const allowed = Object.keys(ALLOWED_CONTENT_TYPES).join(', ');
      return errorResponse(
        400,
        `Unsupported content type: ${contentType}. Allowed types: ${allowed}`,
        'INVALID_CONTENT_TYPE',
      );
    }

    // Step 5: Generate scoped S3 key
    const id = ulid();
    const key = `receipts/${accountId}/${id}.${extension}`;

    // Step 6: Get presigned URL
    const uploadUrl = await deps.getSignedUrl(
      deps.bucketName,
      key,
      contentType,
      PRESIGNED_URL_TTL,
    );

    // Step 7: Return response
    return successResponse({ uploadUrl, key });
  };
}
