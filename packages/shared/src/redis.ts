import Redis from 'ioredis';

let _redis: Redis | null = null;

export function createRedis(url: string): Redis {
  if (_redis) return _redis;

  _redis = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times: number) {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
  });

  return _redis;
}

export function getRedis(): Redis {
  if (!_redis) {
    throw new Error('Redis not initialized. Call createRedis() first.');
  }
  return _redis;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}

export async function checkRedisHealth(url: string): Promise<boolean> {
  try {
    const redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      retryStrategy: () => null,
    });
    const result = await redis.ping();
    await redis.quit();
    return result === 'PONG';
  } catch {
    return false;
  }
}
