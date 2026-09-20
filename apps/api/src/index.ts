import {
  EnvError,
  checkDatabaseHealth,
  closeDb,
  closeRedis,
  createRedis,
  loadEnv,
  query,
} from '@intel/shared';
import { buildApp } from './app.js';
import { closeIngestionQueue } from './services/ingestion.js';

async function main(): Promise<void> {
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    if (err instanceof EnvError) {
      console.error(`\n${err.message}\n\nCopy .env.example to .env and fill in the required values.\n`);
      process.exit(1);
    }
    throw err;
  }

  // Fail fast and clearly rather than throwing on the first request.
  if (!(await checkDatabaseHealth())) {
    console.error(
      `Cannot connect to the database at ${redactUrl(env.DATABASE_URL)}.\n` +
        'Start Postgres (docker compose up -d) and try again.'
    );
    process.exit(1);
  }
  const migrated = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'people' AND column_name = 'dedupe_key'
     ) AS ok`
  );
  if (!migrated[0]?.ok) {
    console.error('The database schema is out of date. Run `pnpm db:migrate` and restart.');
    process.exit(1);
  }

  if (env.REDIS_URL) createRedis(env.REDIS_URL);

  const app = await buildApp({ env });
  app.log.info(
    env.REDIS_URL
      ? 'Redis configured: rate limits are shared across instances'
      : 'No REDIS_URL: rate limits are per-process and imports run in-process'
  );

  setupShutdown(app);
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(
    `SpiderWeb API listening on http://${env.HOST}:${env.PORT} (ingestion: ${env.INGESTION_MODE})`
  );
}

function setupShutdown(app: Awaited<ReturnType<typeof buildApp>>): void {
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info(`${signal} received, shutting down`);
    try {
      await app.close();
      await closeIngestionQueue();
      await closeRedis();
      await closeDb();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Shutdown failed');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

/** Keep credentials out of startup logs. */
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = '';
    parsed.username = parsed.username ? '***' : '';
    return parsed.toString();
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

main().catch((err) => {
  console.error('Failed to start the API:', err);
  process.exit(1);
});
