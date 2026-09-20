import type { FastifyReply, FastifyRequest } from 'fastify';
import { tryGetRedis } from '@intel/shared';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Sliding-window rate limiting.
 *
 * Uses Redis when it is configured so limits hold across API instances, and an
 * in-process counter otherwise — a single-instance deployment should still be
 * protected rather than silently unlimited, which is what the previous
 * implementation did whenever Redis was absent.
 */
const memory = new Map<string, Bucket>();

function memoryHit(key: string, windowMs: number): number {
  const now = Date.now();
  const bucket = memory.get(key);
  if (!bucket || bucket.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    if (memory.size > 10_000) {
      for (const [k, b] of memory) if (b.resetAt <= now) memory.delete(k);
    }
    return 1;
  }
  bucket.count += 1;
  return bucket.count;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  name: string;
}

export function rateLimit({ windowMs, max, name }: RateLimitOptions) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const identity = request.user?.id ?? request.ip ?? 'anonymous';
    const key = `ratelimit:${name}:${identity}`;
    let count: number;

    const redis = tryGetRedis();
    if (redis) {
      try {
        const results = await redis.multi().incr(key).pexpire(key, windowMs, 'NX').exec();
        count = Number(results?.[0]?.[1] ?? 0) || memoryHit(key, windowMs);
      } catch (err) {
        request.log.warn({ err }, 'Rate limiter fell back to in-process counting');
        count = memoryHit(key, windowMs);
      }
    } else {
      count = memoryHit(key, windowMs);
    }

    reply.header('X-RateLimit-Limit', max);
    reply.header('X-RateLimit-Remaining', Math.max(0, max - count));

    if (count > max) {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: `Too many requests. Try again in ${Math.ceil(windowMs / 1000)} seconds.`,
        },
      });
    }
  };
}

export const apiRateLimit = rateLimit({ windowMs: 60_000, max: 600, name: 'api' });
/**
 * Uploads are the expensive path. A ten-minute window bounds abuse while still
 * recovering quickly enough that a legitimate user importing several CSVs in a
 * row — or a CI run — is not locked out for an hour.
 */
export const uploadRateLimit = rateLimit({ windowMs: 10 * 60_000, max: 20, name: 'upload' });
export const writeRateLimit = rateLimit({ windowMs: 60_000, max: 120, name: 'write' });
