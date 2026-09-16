import type { FastifyInstance } from 'fastify';
import { closeDb, closeRedis, closeS3 } from '@intel/shared';

export function setupGracefulShutdown(app: FastifyInstance): void {
  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received. Starting graceful shutdown...`);

    try {
      await app.close();
      app.log.info('HTTP server closed');

      await closeDb();
      app.log.info('Database connection closed');

      await closeRedis();
      app.log.info('Redis connection closed');

      await closeS3();
      app.log.info('S3 client closed');

      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
