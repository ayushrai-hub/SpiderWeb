import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { globalSearch, semanticSearch } from '../../services/search.js';

const searchQuerySchema = z.object({
  q: z.string().min(1),
  types: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/search', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const query = searchQuerySchema.parse(request.query);

    const types = query.types ? query.types.split(',') : undefined;

    try {
      const results = await globalSearch({
        workspaceId,
        query: query.q,
        types,
        limit: query.limit,
      });

      return reply.send({
        data: results.results,
        pagination: {
          total: results.total,
          limit: query.limit,
          offset: query.offset,
        },
        query: results.query,
        types: results.types,
      });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'SEARCH_FAILED', message: error.message },
      });
    }
  });

  app.get('/api/v1/search/semantic', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const query = searchQuerySchema.parse(request.query);

    try {
      const results = await semanticSearch(
        workspaceId,
        query.q,
        query.limit
      );

      return reply.send({
        data: results,
        query: query.q,
      });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'SEARCH_FAILED', message: error.message },
      });
    }
  });
}
