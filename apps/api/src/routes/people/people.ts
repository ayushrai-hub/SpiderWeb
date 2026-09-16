import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSupabase } from '@intel/shared';
import { authMiddleware } from '../../middleware/auth.js';

const personQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  location: z.string().optional(),
  sortBy: z.enum(['full_name', 'created_at', 'updated_at']).default('full_name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export async function peopleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/people', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const query = personQuerySchema.parse(request.query);

    const supabase = getSupabase();
    let queryBuilder = supabase
      .from('people')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId);

    if (query.search) {
      queryBuilder = queryBuilder.or(
        `full_name.ilike.%${query.search}%,email.ilike.%${query.search}%,company_name.ilike.%${query.search}%`
      );
    }

    if (query.company) {
      queryBuilder = queryBuilder.ilike('company_name', `%${query.company}%`);
    }

    if (query.title) {
      queryBuilder = queryBuilder.ilike('title', `%${query.title}%`);
    }

    if (query.location) {
      queryBuilder = queryBuilder.ilike('location', `%${query.location}%`);
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

  app.get('/api/v1/people/:personId', async (request, reply) => {
    const { personId } = request.params as { personId: string };
    const workspaceId = request.user.workspaceId;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('people')
      .select('*')
      .eq('id', personId)
      .eq('workspace_id', workspaceId)
      .single();

    if (error || !data) {
      return reply.status(404).send({
        error: { code: 'PERSON_NOT_FOUND', message: 'Person not found' },
      });
    }

    // Get related data
    const [connections, skills, education, employment] = await Promise.all([
      supabase.from('connections').select('*').eq('person_id', personId).eq('workspace_id', workspaceId),
      supabase.from('skills').select('*').eq('person_id', personId).eq('workspace_id', workspaceId),
      supabase.from('education').select('*').eq('person_id', personId).eq('workspace_id', workspaceId),
      supabase.from('person_employment').select('*').eq('person_id', personId).eq('workspace_id', workspaceId),
    ]);

    return reply.send({
      data: {
        ...data,
        connections: connections.data || [],
        skills: skills.data || [],
        education: education.data || [],
        employment: employment.data || [],
      },
    });
  });
}
