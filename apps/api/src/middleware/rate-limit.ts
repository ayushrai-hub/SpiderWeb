import type { FastifyRequest, FastifyReply } from 'fastify';
import { getRedis } from '@intel/shared';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (request: FastifyRequest) => string;
}

const defaultKeyGenerator = (request: FastifyRequest): string => {
  const userId = (request as any).user?.id || 'anonymous';
  const ip = request.ip || request.socket.remoteAddress || 'unknown';
  return `ratelimit:${userId}:${ip}`;
};

export function createRateLimit(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyGenerator = defaultKeyGenerator } = config;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const redis = getRedis();
      const key = keyGenerator(request);
      const now = Date.now();
      const windowStart = now - windowMs;

      // Use Redis sorted set for sliding window
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(key, 0, windowStart);
      pipeline.zadd(key, now, `${now}`);
      pipeline.zcard(key);
      pipeline.expire(key, Math.ceil(windowMs / 1000));

      const results = await pipeline.exec();
      const requestCount = (results?.[2]?.[1] as number) || 0;

      // Set rate limit headers
      reply.header('X-RateLimit-Limit', maxRequests);
      reply.header('X-RateLimit-Remaining', Math.max(0, maxRequests - requestCount));
      reply.header('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));

      if (requestCount > maxRequests) {
        return reply.status(429).send({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
          },
        });
      }
    } catch (err) {
      // If Redis fails, allow request through
      console.error('Rate limit error:', err);
    }
  };
}

// Pre-configured rate limiters
export const apiRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
});

export const authRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
});

export const aiRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20,
});

export const uploadRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
});
