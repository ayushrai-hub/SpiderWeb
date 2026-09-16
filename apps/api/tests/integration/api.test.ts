import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { healthRoutes } from '../../src/routes/health.js';

describe('API Integration', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.register(healthRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds to /health', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('responds to /health/db', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/db',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.component).toBe('postgresql');
    expect(['ok', 'error']).toContain(body.status);
  });

  it('responds to /health/redis', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/redis',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.component).toBe('redis');
    expect(['ok', 'error']).toContain(body.status);
  });

  it('responds to /health/storage', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/storage',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.component).toBe('s3');
    expect(['ok', 'error']).toContain(body.status);
  });
});
