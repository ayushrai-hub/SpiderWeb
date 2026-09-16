import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/authorize.js';
import {
  storeCredential,
  listCredentials,
  deleteCredential,
  testCredential,
} from '@intel/ai';
import { logAuditEvent } from '../../services/audit.js';

const addCredentialSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google', 'openrouter']),
  apiKey: z.string().min(1),
});

export async function credentialRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/credentials', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const userId = request.user.id;

    try {
      const credentials = await listCredentials(workspaceId, userId);
      return reply.send({ data: credentials });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'LIST_FAILED', message: error.message },
      });
    }
  });

  app.post('/api/v1/credentials', {
    preHandler: [requireRole('owner', 'admin')],
  }, async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const userId = request.user.id;
    const body = addCredentialSchema.parse(request.body);

    try {
      // Validate key first
      const { getLLMGateway } = await import('@intel/ai');
      const gateway = getLLMGateway();
      const isValid = await gateway.validateKey(body.provider, body.apiKey);
      
      if (!isValid) {
        return reply.status(400).send({
          error: { code: 'INVALID_KEY', message: 'API key is invalid' },
        });
      }

      const credential = await storeCredential(workspaceId, userId, body.provider, body.apiKey);

      await logAuditEvent({
        workspaceId,
        userId,
        action: 'credential.added',
        resource: 'credential',
        resourceId: credential.id,
        metadata: { provider: body.provider },
      });

      return reply.status(201).send({ data: credential });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'STORE_FAILED', message: error.message },
      });
    }
  });

  app.delete('/api/v1/credentials/:credentialId', {
    preHandler: [requireRole('owner', 'admin')],
  }, async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const userId = request.user.id;
    const { credentialId } = request.params as { credentialId: string };

    try {
      await deleteCredential(workspaceId, userId, credentialId);

      await logAuditEvent({
        workspaceId,
        userId,
        action: 'credential.removed',
        resource: 'credential',
        resourceId: credentialId,
      });

      return reply.send({ data: { message: 'Credential deleted' } });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'DELETE_FAILED', message: error.message },
      });
    }
  });

  app.post('/api/v1/credentials/:credentialId/test', {
    preHandler: [requireRole('owner', 'admin')],
  }, async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const userId = request.user.id;
    const { credentialId } = request.params as { credentialId: string };

    try {
      // Get credential to find provider
      const credentials = await listCredentials(workspaceId, userId);
      const credential = credentials.find(c => c.id === credentialId);
      
      if (!credential) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Credential not found' },
        });
      }

      const isValid = await testCredential(workspaceId, userId, credential.provider);

      return reply.send({
        data: {
          valid: isValid,
          message: isValid ? 'Connection successful' : 'Connection failed',
        },
      });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'TEST_FAILED', message: error.message },
      });
    }
  });
}
