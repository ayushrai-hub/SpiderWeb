import { createRequire } from 'node:module';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { getEnv, type Env } from '@intel/shared';
import { registerErrorHandler } from './middleware/error-handler.js';
import { apiRateLimit } from './middleware/rate-limit.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { importRoutes, MAX_FILE_BYTES, MAX_FILES } from './routes/imports.js';
import { networkRoutes } from './routes/network.js';
import { insightRoutes } from './routes/insights.js';
import { communicationRoutes } from './routes/communication.js';
import { exportRoutes } from './routes/exports.js';
import { analyticsRoutes } from './routes/analytics.js';

export interface BuildOptions {
  env?: Env;
  /** Silence the logger in tests. */
  logger?: boolean;
}

/**
 * Assemble the API without starting it, so tests can drive it through
 * `app.inject()` and exercise the same middleware chain as production.
 */
/**
 * Pretty logs in development, plain JSON otherwise. pino-pretty is a dev-only
 * dependency, so a production bundle that lacks it must still start.
 */
function loggerOptions(env: Env) {
  const base = {
    level: env.LOG_LEVEL,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  };
  if (env.NODE_ENV !== 'development') return base;
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return { ...base, transport: { target: 'pino-pretty' } };
  } catch {
    return base;
  }
}

export async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? getEnv();

  const app = Fastify({
    logger: options.logger === false ? false : loggerOptions(env),
    // Uploads stream through @fastify/multipart, so the JSON body limit stays small.
    bodyLimit: 1 * 1024 * 1024,
    trustProxy: env.NODE_ENV === 'production',
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES, fields: 20 },
  });

  registerErrorHandler(app);
  app.addHook('onRequest', apiRateLimit);

  await app.register(healthRoutes);
  await app.register(meRoutes);
  await app.register(importRoutes);
  await app.register(networkRoutes);
  await app.register(insightRoutes);
  await app.register(analyticsRoutes);
  await app.register(communicationRoutes);
  await app.register(exportRoutes);

  return app;
}
