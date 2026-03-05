import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { getPresignedUploadUrl } from '../../src/lib/s3.js';

/**
 * Mock the @aws-sdk/s3-request-presigner module so we can inspect
 * the PutObjectCommand passed to getSignedUrl.
 */
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned'),
}));

const s3Mock = mockClient(S3Client);

describe('getPresignedUploadUrl', () => {
  beforeEach(() => {
    s3Mock.reset();
    vi.clearAllMocks();
  });

  it('includes ContentLength in the PutObjectCommand', async () => {
    const { getSignedUrl: mockGetSignedUrl } = await import(
      '@aws-sdk/s3-request-presigner'
    );
    const typedMock = mockGetSignedUrl as ReturnType<typeof vi.fn>;

    const client = new S3Client({});
    await getPresignedUploadUrl(client, 'test-bucket', 'test-key', 'image/jpeg', 1_048_576, 900);

    expect(typedMock).toHaveBeenCalledOnce();
    const command = typedMock.mock.calls[0][1] as PutObjectCommand;
    expect(command.input.ContentLength).toBe(1_048_576);
  });

  it('includes ContentType in the PutObjectCommand', async () => {
    const { getSignedUrl: mockGetSignedUrl } = await import(
      '@aws-sdk/s3-request-presigner'
    );
    const typedMock = mockGetSignedUrl as ReturnType<typeof vi.fn>;

    const client = new S3Client({});
    await getPresignedUploadUrl(client, 'my-bucket', 'my-key', 'image/png', 500, 300);

    expect(typedMock).toHaveBeenCalled();
    const command = typedMock.mock.calls[0][1] as PutObjectCommand;
    expect(command.input.ContentType).toBe('image/png');
  });

  it('passes correct Bucket and Key to PutObjectCommand', async () => {
    const { getSignedUrl: mockGetSignedUrl } = await import(
      '@aws-sdk/s3-request-presigner'
    );
    const typedMock = mockGetSignedUrl as ReturnType<typeof vi.fn>;

    const client = new S3Client({});
    await getPresignedUploadUrl(client, 'my-bucket', 'receipts/acct/file.jpg', 'image/jpeg', 1024, 600);

    const command = typedMock.mock.calls[0][1] as PutObjectCommand;
    expect(command.input.Bucket).toBe('my-bucket');
    expect(command.input.Key).toBe('receipts/acct/file.jpg');
  });

  it('passes expiresIn to the presigner options', async () => {
    const { getSignedUrl: mockGetSignedUrl } = await import(
      '@aws-sdk/s3-request-presigner'
    );
    const typedMock = mockGetSignedUrl as ReturnType<typeof vi.fn>;

    const client = new S3Client({});
    await getPresignedUploadUrl(client, 'bucket', 'key', 'image/jpeg', 1024, 900);

    const options = typedMock.mock.calls[0][2] as { expiresIn: number };
    expect(options.expiresIn).toBe(900);
  });

  it('returns the presigned URL string', async () => {
    const client = new S3Client({});
    const url = await getPresignedUploadUrl(client, 'bucket', 'key', 'image/jpeg', 1024, 900);
    expect(url).toBe('https://s3.example.com/presigned');
  });
});
