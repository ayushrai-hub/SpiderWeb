import { describe, it, expect, beforeAll } from 'vitest';
import { S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

describe('S3/MinIO Integration', () => {
  let s3: S3Client;
  const bucket = process.env.S3_BUCKET || 'intel-dev';
  let minioAvailable = false;

  beforeAll(async () => {
    s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
        secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
      },
      forcePathStyle: true,
    });

    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
      minioAvailable = true;
    } catch {
      minioAvailable = false;
    }
  });

  it('can access bucket', async () => {
    if (!minioAvailable) {
      console.log('MinIO not available, skipping test');
      return;
    }

    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    expect(true).toBe(true);
  });

  it('can put and get objects', async () => {
    if (!minioAvailable) {
      console.log('MinIO not available, skipping test');
      return;
    }

    const testKey = `test/integration-${Date.now()}.txt`;
    const content = 'Hello from integration test';

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        Body: content,
        ContentType: 'text/plain',
      }),
    );

    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: testKey,
      }),
    );

    const body = await response.Body?.transformToString();
    expect(body).toBe(content);

    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: testKey,
      }),
    );
  });
});
