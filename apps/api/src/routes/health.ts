import type { FastifyInstance } from 'fastify';
import { checkDatabaseHealth, checkRedisHealth, getEnv, query } from '@intel/shared';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ status: 'ok', uptime: Math.round(process.uptime()) }));

  /**
   * Readiness: reports the state of every dependency plus whether the schema is
   * migrated, so a broken deployment is visible without reading logs.
   */
  app.get('/health/ready', async (_request, reply) => {
    const env = getEnv();
    const database = await checkDatabaseHealth();
    const redis = env.REDIS_URL ? await checkRedisHealth() : null;

    let migrated = false;
    let pendingHint: string | null = null;
    if (database) {
      const rows = await query<{ ok: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'people' AND column_name = 'dedupe_key'
         ) AS ok`
      );
      migrated = rows[0]?.ok === true;
      if (!migrated) pendingHint = 'Run `pnpm db:migrate`.';
    }

    const ready = database && migrated && (env.INGESTION_MODE !== 'queue' || redis === true);
    return reply.status(ready ? 200 : 503).send({
      status: ready ? 'ready' : 'not_ready',
      checks: {
        database: { ok: database },
        migrations: { ok: migrated, hint: pendingHint },
        redis: { ok: redis, required: env.INGESTION_MODE === 'queue' },
      },
      ingestionMode: env.INGESTION_MODE,
    });
  });
}
