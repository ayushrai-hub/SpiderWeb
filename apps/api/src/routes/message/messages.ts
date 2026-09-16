import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSupabase } from '@intel/shared';
import { authMiddleware } from '../../middleware/auth.js';

const messageQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  conversationId: z.string().uuid().optional(),
  sortBy: z.enum(['sent_at', 'created_at']).default('sent_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export async function messagesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/messages', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const query = messageQuerySchema.parse(request.query);

    const supabase = getSupabase();
    let queryBuilder = supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId);

    if (query.search) {
      queryBuilder = queryBuilder.ilike('content', `%${query.search}%`);
    }

    if (query.direction) {
      queryBuilder = queryBuilder.eq('direction', query.direction);
    }

    if (query.conversationId) {
      queryBuilder = queryBuilder.eq('conversation_id', query.conversationId);
    }

    const from = (query.page - 1) * query.limit;
    const to = from + query.limit - 1;

    const { data, error, count } = await queryBuilder
      .order(query.sortBy, { ascending: query.sortOrder === 'asc' })
      .range(from, to);

    if (error) {
      return reply.status(500).send({
        error: { code: 'QUERY_FAILED', message: error.message },
      });
    }

    return reply.send({
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / query.limit),
      },
    });
  });

  app.get('/api/v1/messages/:messageId', async (request, reply) => {
    const { messageId } = request.params as { messageId: string };
    const workspaceId = request.user.workspaceId;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .eq('workspace_id', workspaceId)
      .single();

    if (error || !data) {
      return reply.status(404).send({
        error: { code: 'MESSAGE_NOT_FOUND', message: 'Message not found' },
      });
    }

    return reply.send({ data });
  });
}
