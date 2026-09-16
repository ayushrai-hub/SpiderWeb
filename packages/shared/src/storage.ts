import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

let _s3: S3Client | null = null;

export function createS3(config: {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region?: string;
}): S3Client {
  if (_s3) return _s3;

  _s3 = new S3Client({
    endpoint: config.endpoint,
    region: config.region || 'us-east-1',
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: true,
  });

  return _s3;
}

export function getS3(): S3Client {
  if (!_s3) {
    throw new Error('S3 not initialized. Call createS3() first.');
  }
  return _s3;
}

export async function closeS3(): Promise<void> {
  _s3 = null;
}

export async function checkS3Health(config: {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region?: string;
}): Promise<boolean> {
  try {
    const s3 = createS3(config);
    await s3.send(new HeadBucketCommand({ Bucket: config.bucket }));
    return true;
  } catch {
    return false;
  }
}

export async function uploadFile(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string,
): Promise<void> {
  const s3 = getS3();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getFile(bucket: string, key: string): Promise<Uint8Array> {
  const s3 = getS3();
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error(`File not found: ${key}`);
  }

  return response.Body.transformToByteArray();
}
