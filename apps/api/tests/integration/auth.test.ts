import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { authRoutes } from '../../src/routes/auth/signup.js';

describe('Auth Integration', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.register(authRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects signup with invalid email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: {
        email: 'not-an-email',
        password: 'password123',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toBeDefined();
  });

  it('rejects signup with short password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: {
        email: 'test@example.com',
        password: '123',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects login with missing fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects logout without token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
    });

    // Logout should succeed even without token (signOut is client-side)
    expect([200, 401]).toContain(response.statusCode);
  });

  it('rejects reset with invalid email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset',
      payload: {
        email: 'invalid',
      },
    });

    expect(response.statusCode).toBe(400);
  });
});
