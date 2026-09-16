import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware/auth.js';
import {
  getConnectionsGraph,
  getCompanyGraph,
  getNetworkOverview,
  getPeopleAtCompany,
  getSharedSkills,
  getCareerTransitions,
} from '../../services/graph.js';

export async function graphRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/graph/overview', async (request, reply) => {
    const workspaceId = request.user.workspaceId;

    try {
      const graph = await getNetworkOverview(workspaceId);
      return reply.send({ data: graph });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'GRAPH_FAILED', message: error.message },
      });
    }
  });

  app.get('/api/v1/graph/person/:personId', async (request, reply) => {
    const { personId } = request.params as { personId: string };
    const workspaceId = request.user.workspaceId;
    const { depth = 2 } = request.query as { depth?: number };

    try {
      const graph = await getConnectionsGraph(workspaceId, personId, depth);
      return reply.send({ data: graph });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'GRAPH_FAILED', message: error.message },
      });
    }
  });

  app.get('/api/v1/graph/company/:companyId', async (request, reply) => {
    const { companyId } = request.params as { companyId: string };
    const workspaceId = request.user.workspaceId;

    try {
      const graph = await getCompanyGraph(workspaceId, companyId);
      return reply.send({ data: graph });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'GRAPH_FAILED', message: error.message },
      });
    }
  });

  app.get('/api/v1/graph/company/:companyName/people', async (request, reply) => {
    const { companyName } = request.params as { companyName: string };
    const workspaceId = request.user.workspaceId;

    try {
      const graph = await getPeopleAtCompany(workspaceId, companyName);
      return reply.send({ data: graph });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'GRAPH_FAILED', message: error.message },
      });
    }
  });

  app.get('/api/v1/graph/skills/shared', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const { personId1, personId2 } = request.query as { personId1: string; personId2: string };

    try {
      const skills = await getSharedSkills(workspaceId, personId1, personId2);
      return reply.send({ data: skills });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'GRAPH_FAILED', message: error.message },
      });
    }
  });

  app.get('/api/v1/graph/person/:personId/transitions', async (request, reply) => {
    const { personId } = request.params as { personId: string };
    const workspaceId = request.user.workspaceId;

    try {
      const transitions = await getCareerTransitions(workspaceId, personId);
      return reply.send({ data: transitions });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'GRAPH_FAILED', message: error.message },
      });
    }
  });
}
