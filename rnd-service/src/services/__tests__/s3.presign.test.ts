/**
 * getPresignedUploadUrl — the presign step of direct browser-to-S3 upload.
 * AWS SDK is mocked; no real network/credentials.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSignedUrlMock } = vi.hoisted(() => ({ getSignedUrlMock: vi.fn().mockResolvedValue('https://s3.test/presigned-put') }));

vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: getSignedUrlMock }));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {},
  GetObjectCommand: class { constructor(public input: any) {} },
  PutObjectCommand: class { constructor(public input: any) {} },
  HeadObjectCommand: class { constructor(public input: any) {} }
}));

import { getPresignedUploadUrl, PRESIGN_EXPIRY_2_HOURS } from '../s3.service';

beforeEach(() => {
  getSignedUrlMock.mockClear();
  process.env.AWS_BUCKET_NAME = 'test-bucket';
});

describe('getPresignedUploadUrl', () => {
  it('presigns a PutObjectCommand for the given key, defaulting to the 2h expiry', async () => {
    const url = await getPresignedUploadUrl('events/2026/123-photo.jpg');

    expect(url).toBe('https://s3.test/presigned-put');
    const [, command, opts] = getSignedUrlMock.mock.calls[0];
    expect(command.input).toEqual({ Bucket: 'test-bucket', Key: 'events/2026/123-photo.jpg' });
    expect(opts).toEqual({ expiresIn: PRESIGN_EXPIRY_2_HOURS });
  });

  it('does NOT include ContentType in the signed command — signing it would force the browser to replay an exact header or get SignatureDoesNotMatch', async () => {
    await getPresignedUploadUrl('events/2026/123-video.mp4');

    const [, command] = getSignedUrlMock.mock.calls[0];
    expect(command.input).not.toHaveProperty('ContentType');
  });

  it('honors a custom expiry', async () => {
    await getPresignedUploadUrl('events/2026/123-photo.jpg', 300);
    const [, , opts] = getSignedUrlMock.mock.calls[0];
    expect(opts).toEqual({ expiresIn: 300 });
  });
});
