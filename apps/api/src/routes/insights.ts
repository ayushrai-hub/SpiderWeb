import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { notFound } from '../middleware/error-handler.js';
import { getDashboard, getOpportunities } from '../services/dashboard.js';
import { getCompany, listCompanies } from '../services/companies.js';
import { globalSearch, type SearchType } from '../services/search.js';
import { getGraph } from '../services/graph.js';

const paged = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['connections', 'name']).optional(),
});

const searchSchema = z.object({
  q: z.string().trim().min(1).max(200),
  types: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const graphSchema = z.object({
  companyId: z.string().uuid().optional(),
  minSize: z.coerce.number().int().min(1).max(100).optional(),
  includeSchools: z.enum(['true', 'false']).optional(),
});

export async function insightRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/dashboard', async (request) => ({
    data: await getDashboard(request.user.workspaceId),
  }));

  app.get('/api/v1/opportunities', async (request) => {
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .parse((request.query as { limit?: string }).limit);
    return { data: await getOpportunities(request.user.workspaceId, limit) };
  });

  app.get('/api/v1/companies', async (request) => {
    const { q, page, limit, sort } = paged.parse(request.query);
    const { rows, total } = await listCompanies(request.user.workspaceId, { q, page, limit, sort });
    return {
      data: rows,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  });

  app.get('/api/v1/companies/:companyId', async (request) => {
    const { companyId } = request.params as { companyId: string };
    const company = await getCompany(request.user.workspaceId, companyId);
    if (!company) throw notFound('That company');
    return { data: company };
  });

  app.get('/api/v1/search', async (request) => {
    const { q, types, limit } = searchSchema.parse(request.query);
    const parsedTypes = (types ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter((t): t is SearchType => t === 'person' || t === 'company' || t === 'conversation');
    const { hits, total } = await globalSearch(request.user.workspaceId, q, { types: parsedTypes, limit });
    return { data: hits, query: q, total };
  });

  app.get('/api/v1/graph', async (request) => {
    const { companyId, minSize, includeSchools } = graphSchema.parse(request.query);
    return {
      data: await getGraph(request.user.workspaceId, {
        focusCompanyId: companyId,
        minSize,
        includeSchools: includeSchools !== 'false',
      }),
    };
  });
}
