import { z } from 'zod';

/**
 * Environment contract.
 *
 * Validation is strict and the failure message names every missing or invalid
 * variable, so a misconfigured deployment fails at boot with an actionable
 * error instead of throwing something obscure on the first request.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (postgres connection string)'),

  /**
   * Optional. When set, imports are handed to a BullMQ queue so they can be
   * processed by a separate worker. When unset, the API processes imports
   * in-process (see INGESTION_MODE).
   */
  REDIS_URL: z.string().optional(),

  /**
   * `inline`  — the API processes imports itself in the background (default).
   * `queue`   — imports are enqueued for the ingestion worker; requires REDIS_URL.
   */
  INGESTION_MODE: z.enum(['inline', 'queue']).default('inline'),

  UPLOAD_DIR: z.string().default('/tmp/spiderweb-uploads'),
  TEMP_DIR: z.string().default('/tmp/spiderweb-extract'),
  /** Keep raw uploaded archives after processing. Debug only. */
  KEEP_RAW_UPLOADS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export class EnvError extends Error {
  constructor(issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError(result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
  }
  if (result.data.INGESTION_MODE === 'queue' && !result.data.REDIS_URL) {
    throw new EnvError(['REDIS_URL: required when INGESTION_MODE=queue']);
  }
  cached = result.data;
  return cached;
}

export function getEnv(): Env {
  return cached ?? loadEnv();
}

/** Test helper: forget the cached environment. */
export function resetEnv(): void {
  cached = null;
}
