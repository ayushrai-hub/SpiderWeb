import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSupabase } from '@intel/shared';
import { authMiddleware } from '../../middleware/auth.js';

const companyQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
  sortBy: z.enum(['canonical_name', 'created_at', 'updated_at']).default('canonical_name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export async function companiesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/companies', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const query = companyQuerySchema.parse(request.query);

    const supabase = getSupabase();
    let queryBuilder = supabase
      .from('companies')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId);

    if (query.search) {
      queryBuilder = queryBuilder.or(
        `canonical_name.ilike.%${query.search}%,industry.ilike.%${query.search}%,location.ilike.%${query.search}%`
      );
    }

    if (query.industry) {
      queryBuilder = queryBuilder.ilike('industry', `%${query.industry}%`);
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

  app.get('/api/v1/companies/:companyId', async (request, reply) => {
    const { companyId } = request.params as { companyId: string };
    const workspaceId = request.user.workspaceId;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .eq('workspace_id', workspaceId)
      .single();

    if (error || !data) {
      return reply.status(404).send({
        error: { code: 'COMPANY_NOT_FOUND', message: 'Company not found' },
      });
    }

    // Get people at this company
    const { data: people } = await supabase
      .from('people')
      .select('*')
      .eq('workspace_id', workspaceId)
      .ilike('company_name', `%${data.canonical_name}%`);

    // Get jobs at this company
    const { data: jobs } = await supabase
      .from('jobs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .ilike('company', `%${data.canonical_name}%`);

    return reply.send({
      data: {
        ...data,
        people: people || [],
        jobs: jobs || [],
      },
    });
  });
}
