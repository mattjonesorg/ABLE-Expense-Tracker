/**
 * Lambda entry point for POST /uploads/request-url.
 * Wires up S3 presigned URL generation and exports the handler.
 */
import { S3Client } from '@aws-sdk/client-s3';
import { getPresignedUploadUrl } from '../../lib/s3.js';
import { extractAuthContext } from '../../middleware/auth.js';
import { createUploadUrlHandler } from './request-url.js';

const s3Client = new S3Client({});

export const handler = createUploadUrlHandler({
  authenticate: async (event) => extractAuthContext(event),
  getSignedUrl: (bucketName, key, contentType, expiresIn) =>
    getPresignedUploadUrl(s3Client, bucketName, key, contentType, expiresIn),
  bucketName: process.env['BUCKET_NAME']!,
});
