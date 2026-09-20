import { Redis } from 'ioredis';

let client: Redis | null = null;

export function createRedis(url: string): Redis {
  if (client) return client;
  client = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
    retryStrategy(times: number) {
      if (times > 5) return null;
      return Math.min(times * 250, 2000);
    },
  });
  // Without a listener ioredis emits an unhandled 'error' event and crashes
  // the process when Redis is briefly unavailable.
  client.on('error', () => {});
  return client;
}

export function getRedis(): Redis {
  if (!client) throw new Error('Redis is not initialised. Call createRedis(url) first.');
  return client;
}

/** Null instead of throwing, for code paths where Redis is optional. */
export function tryGetRedis(): Redis | null {
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    const c = client;
    client = null;
    await c.quit().catch(() => c.disconnect());
  }
}

export async function checkRedisHealth(): Promise<boolean> {
  const c = tryGetRedis();
  if (!c) return false;
  try {
    return (await c.ping()) === 'PONG';
  } catch {
    return false;
  }
}
