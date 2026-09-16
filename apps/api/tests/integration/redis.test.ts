import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';

describe('Redis Integration', () => {
  let redis: Redis;

  beforeAll(() => {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      retryStrategy: () => null,
    });
  });

  afterAll(async () => {
    if (redis) await redis.quit();
  });

  it('connects to Redis', async () => {
    const result = await redis.ping();
    expect(result).toBe('PONG');
  });

  it('can set and get values', async () => {
    await redis.set('test:key', 'test-value');
    const value = await redis.get('test:key');
    expect(value).toBe('test-value');
    await redis.del('test:key');
  });

  it('can use lists', async () => {
    await redis.lpush('test:list', 'a', 'b', 'c');
    const items = await redis.lrange('test:list', 0, -1);
    expect(items).toEqual(['c', 'b', 'a']);
    await redis.del('test:list');
  });
});
