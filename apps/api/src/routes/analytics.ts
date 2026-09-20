import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { writeRateLimit } from '../middleware/rate-limit.js';
import { notFound } from '../middleware/error-handler.js';
import {
  askNetwork,
  deleteSegment,
  getAnalyticsRecords,
  getAnalyticsReport,
  listSegments,
  queryOpportunities,
  saveSegment,
} from '../services/analytics.js';

const askSchema = z.object({ q: z.string().trim().min(1).max(400) });

const recordsSchema = z.object({
  metric: z.string().trim().min(1).max(60),
  value: z.string().trim().max(200).optional(),
});

const opportunitySchema = z.object({
  company: z.string().trim().max(200).optional(),
  pastCompany: z.string().trim().max(200).optional(),
  role: z.string().trim().max(200).optional(),
  industry: z.string().trim().max(80).optional(),
  location: z.string().trim().max(200).optional(),
  recentlyMoved: z.enum(['true', 'false']).optional(),
  olderQuiet: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

const segmentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).optional(),
  query: z.record(z.unknown()),
});

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/analytics', async (request) => ({
    data: await getAnalyticsReport(request.user.workspaceId),
  }));

  app.get('/api/v1/analytics/records', async (request) => {
    const { metric, value } = recordsSchema.parse(request.query);
    const rows = await getAnalyticsRecords(request.user.workspaceId, metric, value);
    return { data: rows, metric, value: value ?? null, total: rows.length };
  });

  app.get('/api/v1/analytics/ask', async (request) => {
    const { q } = askSchema.parse(request.query);
    return { data: await askNetwork(request.user.workspaceId, q), query: q };
  });

  app.get('/api/v1/analytics/opportunities', async (request) => {
    const parsed = opportunitySchema.parse(request.query);
    const rows = await queryOpportunities(
      request.user.workspaceId,
      {
        company: parsed.company,
        pastCompany: parsed.pastCompany,
        role: parsed.role,
        industry: parsed.industry,
        location: parsed.location,
        recentlyMoved: parsed.recentlyMoved === 'true',
        olderQuiet: parsed.olderQuiet === 'true',
      },
      parsed.limit
    );
    return { data: rows };
  });

  app.get('/api/v1/segments', async (request) => ({
    data: await listSegments(request.user.workspaceId),
  }));

  app.post('/api/v1/segments', { preHandler: [writeRateLimit] }, async (request, reply) => {
    const body = segmentSchema.parse(request.body);
    const row = await saveSegment(request.user.workspaceId, body);
    return reply.status(201).send({ data: row });
  });

  app.delete('/api/v1/segments/:segmentId', { preHandler: [writeRateLimit] }, async (request, reply) => {
    const { segmentId } = request.params as { segmentId: string };
    const ok = await deleteSegment(request.user.workspaceId, segmentId);
    if (!ok) throw notFound('That segment');
    return reply.status(204).send();
  });
}
