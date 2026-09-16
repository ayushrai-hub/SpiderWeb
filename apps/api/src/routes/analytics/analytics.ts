import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware/auth.js';
import {
  getNetworkAnalytics,
  getCommunicationAnalytics,
  getOutreachAnalytics,
  getCareerAnalytics,
  getContentAnalytics,
  getRelationshipAnalytics,
  getDataQualityAnalytics,
} from '../../services/analytics.js';

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/analytics/network', async (request, reply) => {
    const workspaceId = request.user.workspaceId;

    try {
      const analytics = await getNetworkAnalytics(workspaceId);
      return reply.send({ data: analytics });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'ANALYTICS_FAILED', message: error.message },
      });
    }
  });

  app.get('/api/v1/analytics/communication', async (request, reply) => {
    const workspaceId = request.user.workspaceId;

    try {
      const analytics = await getCommunicationAnalytics(workspaceId);
      return reply.send({ data: analytics });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'ANALYTICS_FAILED', message: error.message },
      });
    }
  });

  app.get('/api/v1/analytics/outreach', async (request, reply) => {
    const workspaceId = request.user.workspaceId;

    try {
      const analytics = await getOutreachAnalytics(workspaceId);
      return reply.send({ data: analytics });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'ANALYTICS_FAILED', message: error.message },
      });
    }
  });

  app.get('/api/v1/analytics/career', async (request, reply) => {
    const workspaceId = request.user.workspaceId;

    try {
      const analytics = await getCareerAnalytics(workspaceId);
      return reply.send({ data: analytics });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'ANALYTICS_FAILED', message: error.message },
      });
    }
  });

  app.get('/api/v1/analytics/content', async (request, reply) => {
    const workspaceId = request.user.workspaceId;

    try {
      const analytics = await getContentAnalytics(workspaceId);
      return reply.send({ data: analytics });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'ANALYTICS_FAILED', message: error.message },
      });
    }
  });

  app.get('/api/v1/analytics/relationships', async (request, reply) => {
    const workspaceId = request.user.workspaceId;

    try {
      const analytics = await getRelationshipAnalytics(workspaceId);
      return reply.send({ data: analytics });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'ANALYTICS_FAILED', message: error.message },
      });
    }
  });

  app.get('/api/v1/analytics/data-quality', async (request, reply) => {
    const workspaceId = request.user.workspaceId;

    try {
      const analytics = await getDataQualityAnalytics(workspaceId);
      return reply.send({ data: analytics });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { code: 'ANALYTICS_FAILED', message: error.message },
      });
    }
  });
}
