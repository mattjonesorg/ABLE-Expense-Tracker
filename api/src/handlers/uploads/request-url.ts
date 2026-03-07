import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { AuthResult } from '../../middleware/auth.js';
import { ulid } from 'ulid';
import { createLogger, extractRequestId } from '../../lib/logger.js';

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
 * Maximum upload file size in bytes (10 MB).
 * Enforced at both the handler level (rejects before presigning)
 * and the S3 level (ContentLength in the presigned URL).
 */
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB = 10485760 bytes

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
    contentLength: number,
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
  fileSize?: unknown;
}

/**
 * Creates a Lambda handler that generates presigned S3 URLs for receipt uploads.
 *
 * The handler:
 * 1. Authenticates the request via injected auth middleware
 * 2. Validates the requested content type is an allowed image format
 * 3. Validates the file size is a positive integer not exceeding MAX_UPLOAD_SIZE (10 MB)
 * 4. Generates a scoped S3 key: receipts/<accountId>/<ulid>.<ext>
 * 5. Returns a presigned PUT URL with ContentLength constraint and a 15-minute TTL
 *
 * @param deps - Injectable dependencies for testability
 * @returns API Gateway v2 handler function
 */
export function createUploadUrlHandler(
  deps: UploadHandlerDeps,
): (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2> {
  const log = createLogger('RequestUploadUrl');

  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    const requestId = extractRequestId(event as unknown as Record<string, unknown>);
    log.info('Request started', requestId);

    // Step 1: Authenticate
    const authResult = await deps.authenticate(event);

    if (!authResult.success) {
      log.warn('Authentication failed', requestId);
      return authResult.response;
    }

    const { accountId } = authResult.context;

    // Step 2: Parse request body
    let requestBody: UploadRequestBody;
    try {
      requestBody = event.body ? (JSON.parse(event.body) as UploadRequestBody) : {};
    } catch {
      log.warn('Invalid JSON body', requestId);
      return errorResponse(400, 'Invalid JSON in request body', 'INVALID_BODY');
    }

    // Step 3: Validate contentType is present
    const { contentType } = requestBody;
    if (!contentType) {
      log.warn('Missing contentType', requestId);
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
      log.warn('Invalid content type', requestId, { contentType });
      return errorResponse(
        400,
        `Unsupported content type: ${contentType}. Allowed types: ${allowed}`,
        'INVALID_CONTENT_TYPE',
      );
    }

    // Step 5: Validate fileSize is present
    const { fileSize } = requestBody;
    if (fileSize === undefined || fileSize === null) {
      log.warn('Missing fileSize', requestId);
      return errorResponse(
        400,
        'Missing required field: fileSize',
        'MISSING_FILE_SIZE',
      );
    }

    // Step 6: Validate fileSize is a positive integer
    if (typeof fileSize !== 'number' || !Number.isInteger(fileSize) || fileSize <= 0) {
      log.warn('Invalid fileSize', requestId);
      return errorResponse(
        400,
        'fileSize must be a positive integer (bytes)',
        'INVALID_FILE_SIZE',
      );
    }

    // Step 7: Validate fileSize does not exceed the maximum
    if (fileSize > MAX_UPLOAD_SIZE) {
      log.warn('File too large', requestId, { fileSize });
      return errorResponse(
        400,
        `File size ${fileSize} bytes exceeds maximum of 10 MB (${MAX_UPLOAD_SIZE} bytes)`,
        'FILE_TOO_LARGE',
      );
    }

    try {
      // Step 8: Generate scoped S3 key
      const id = ulid();
      const key = `receipts/${accountId}/${id}.${extension}`;

      // Step 9: Get presigned URL with ContentLength constraint
      const uploadUrl = await deps.getSignedUrl(
        deps.bucketName,
        key,
        contentType,
        fileSize,
        PRESIGNED_URL_TTL,
      );

      // Step 10: Return response with maxFileSize for client reference
      log.info('Request completed', requestId, { statusCode: 200, contentType });
      return successResponse({ uploadUrl, key, maxFileSize: MAX_UPLOAD_SIZE });
    } catch (err: unknown) {
      const errorName = err instanceof Error ? err.name : 'UnknownError';
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error('Failed to generate presigned URL', requestId, { errorName, errorMessage });
      throw err;
    }
  };
}
