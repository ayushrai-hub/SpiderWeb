import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSupabase } from '@intel/shared';
import { authMiddleware } from '../../middleware/auth.js';

const conversationQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  sortBy: z.enum(['title', 'created_at', 'updated_at']).default('updated_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export async function conversationsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/conversations', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const query = conversationQuerySchema.parse(request.query);

    const supabase = getSupabase();
    let queryBuilder = supabase
      .from('conversations')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId);

    if (query.search) {
      queryBuilder = queryBuilder.ilike('title', `%${query.search}%`);
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

  app.get('/api/v1/conversations/:conversationId', async (request, reply) => {
    const { conversationId } = request.params as { conversationId: string };
    const workspaceId = request.user.workspaceId;

    const supabase = getSupabase();
    const { data: conversation, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('workspace_id', workspaceId)
      .single();

    if (error || !conversation) {
      return reply.status(404).send({
        error: { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found' },
      });
    }

    // Get messages in conversation
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('workspace_id', workspaceId)
      .order('sent_at', { ascending: true });

    // Get participants
    const { data: participants } = await supabase
      .from('conversation_participants')
      .select('*')
      .eq('conversation_id', conversationId);

    return reply.send({
      data: {
        ...conversation,
        messages: messages || [],
        participants: participants || [],
      },
    });
  });

  app.get('/api/v1/conversations/:conversationId/messages', async (request, reply) => {
    const { conversationId } = request.params as { conversationId: string };
    const workspaceId = request.user.workspaceId;
    const { page = 1, limit = 50 } = request.query as { page?: number; limit?: number };

    const supabase = getSupabase();
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('conversation_id', conversationId)
      .eq('workspace_id', workspaceId)
      .order('sent_at', { ascending: true })
      .range(from, to);

    if (error) {
      return reply.status(500).send({
        error: { code: 'QUERY_FAILED', message: error.message },
      });
    }

    return reply.send({
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  });
}
