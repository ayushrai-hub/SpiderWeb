import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { getProfileData } from '../services/profile.js';
import { getProfileAnalytics } from '../services/profile-analytics.js';

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/profile', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    try {
      const profile = await getProfileData(workspaceId);
      return reply.send({ data: profile });
    } catch (err) {
      request.log.error(err, 'profile load failed');
      return reply.status(500).send({
        error: { code: 'PROFILE_FAILED', message: 'Could not load your profile. Try again.' },
      });
    }
  });

  app.get('/api/v1/profile/analytics', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    try {
      const analytics = await getProfileAnalytics(workspaceId);
      return reply.send({ data: analytics });
    } catch (err) {
      request.log.error(err, 'profile analytics failed');
      return reply.status(500).send({
        error: { code: 'PROFILE_ANALYTICS_FAILED', message: 'Could not load analytics. Try again.' },
      });
    }
  });
}
