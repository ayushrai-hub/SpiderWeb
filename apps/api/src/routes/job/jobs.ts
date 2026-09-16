import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSupabase } from '@intel/shared';
import { authMiddleware } from '../../middleware/auth.js';

const jobQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  sortBy: z.enum(['title', 'created_at', 'posted_at']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export async function jobsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/jobs', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const query = jobQuerySchema.parse(request.query);

    const supabase = getSupabase();
    let queryBuilder = supabase
      .from('jobs')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId);

    if (query.search) {
      queryBuilder = queryBuilder.or(
        `title.ilike.%${query.search}%,company.ilike.%${query.search}%,location.ilike.%${query.search}%`
      );
    }

    if (query.company) {
      queryBuilder = queryBuilder.ilike('company', `%${query.company}%`);
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

  app.get('/api/v1/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const workspaceId = request.user.workspaceId;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .eq('workspace_id', workspaceId)
      .single();

    if (error || !data) {
      return reply.status(404).send({
        error: { code: 'JOB_NOT_FOUND', message: 'Job not found' },
      });
    }

    return reply.send({ data });
  });

  app.get('/api/v1/jobs/applications', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };

    const supabase = getSupabase();
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('job_applications')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .order('applied_at', { ascending: false })
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

  app.get('/api/v1/jobs/saved', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };

    const supabase = getSupabase();
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('saved_jobs')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .order('saved_at', { ascending: false })
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
