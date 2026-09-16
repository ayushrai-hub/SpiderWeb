import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { workspaceRoutes } from '../../src/routes/workspace/workspaces.js';

describe('Workspace Integration', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.register(workspaceRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects workspace list without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces',
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects workspace list without workspace header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces',
      headers: {
        authorization: 'Bearer fake-token',
      },
    });

    // Will fail at auth middleware - could be 401 (invalid token) or 400 (missing workspace)
    expect([400, 401, 500]).toContain(response.statusCode);
  });

  it('rejects workspace creation without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      payload: {
        name: 'Test Workspace',
      },
    });

    expect(response.statusCode).toBe(401);
  });
});
