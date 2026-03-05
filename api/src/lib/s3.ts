import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Generate a presigned URL for uploading a file to S3.
 *
 * The presigned URL includes a ContentLength constraint so that S3 will
 * reject uploads whose size does not match the declared file size.
 * This provides defense-in-depth alongside the handler-level size validation.
 *
 * @param client - The S3 client instance
 * @param bucketName - The S3 bucket name
 * @param key - The S3 object key
 * @param contentType - The MIME type of the file being uploaded
 * @param contentLength - The exact file size in bytes (enforced by S3)
 * @param expiresIn - URL expiry in seconds
 * @returns A presigned URL string for PUT upload
 */
export async function getPresignedUploadUrl(
  client: S3Client,
  bucketName: string,
  key: string,
  contentType: string,
  contentLength: number,
  expiresIn: number,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  return awsGetSignedUrl(client, command, { expiresIn });
}
