import type { FastifyInstance } from 'fastify';
import { getDb, checkRedisHealth, checkS3Health, loadEnv } from '@intel/shared';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const env = loadEnv();

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  app.get('/health/db', async () => {
    try {
      const db = getDb();
      await db.execute('SELECT 1');
      return {
        status: 'ok',
        component: 'postgresql',
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        status: 'error',
        component: 'postgresql',
        timestamp: new Date().toISOString(),
      };
    }
  });

  app.get('/health/redis', async () => {
    const healthy = await checkRedisHealth(env.REDIS_URL);
    return {
      status: healthy ? 'ok' : 'error',
      component: 'redis',
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/health/storage', async () => {
    const healthy = await checkS3Health({
      endpoint: env.S3_ENDPOINT,
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
    });
    return {
      status: healthy ? 'ok' : 'error',
      component: 's3',
      timestamp: new Date().toISOString(),
    };
  });
}
