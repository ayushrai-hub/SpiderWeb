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
  sortBy: z.enum(['canonical_name', 'created_at', 'updated_at']).default('canonical_name'),
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
      // Only columns that exist in the people table
      queryBuilder = queryBuilder.or(
        `canonical_name.ilike.%${query.search}%,headline.ilike.%${query.search}%,location.ilike.%${query.search}%`
      );
    }

    if (query.company) {
      queryBuilder = queryBuilder.ilike('headline', `%${query.company}%`);
    }
    if (query.title) {
      queryBuilder = queryBuilder.ilike('headline', `%${query.title}%`);
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
      request.log.error(error, 'people list query failed');
      return reply.status(500).send({
        error: { code: 'QUERY_FAILED', message: 'Could not load people. Try again.' },
      });
    }

    return reply.send({
      data: (data || []).map((p: any) => ({
        id: p.id,
        name: p.canonical_name,
        first_name: p.first_name,
        last_name: p.last_name,
        headline: p.headline,
        location: p.location,
        profile_url: p.profile_url,
        created_at: p.created_at,
      })),
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

    // skills/education tables have no workspace_id column — filter by person only
    const [connections, skills, education, employment] = await Promise.all([
      supabase.from('connections').select('*').eq('person_id', personId),
      supabase.from('skills').select('*').eq('person_id', personId),
      supabase.from('education').select('*').eq('person_id', personId),
      supabase.from('person_employment').select('*').eq('person_id', personId),
    ]);

    return reply.send({
      data: {
        id: data.id,
        name: data.canonical_name,
        first_name: data.first_name,
        last_name: data.last_name,
        headline: data.headline,
        location: data.location,
        profile_url: data.profile_url,
        connections: connections.data || [],
        skills: skills.data || [],
        education: education.data || [],
        employment: employment.data || [],
      },
    });
  });
}
