import type { FastifyInstance } from 'fastify';
import { query } from '@intel/shared';
import { authMiddleware } from '../middleware/auth.js';

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  /** Identity, workspace and the onboarding state the UI branches on. */
  app.get('/api/v1/me', async (request) => {
    const { id, email, name, workspaceId, workspaceRole } = request.user;

    const [workspace] = await query<{ name: string; slug: string; created_at: Date }>(
      `SELECT name, slug, created_at FROM workspaces WHERE id = $1`,
      [workspaceId]
    );
    const [counts] = await query<Record<string, number>>(
      `SELECT
         (SELECT count(*)::int FROM people WHERE workspace_id = $1 AND NOT is_self)      AS connections,
         (SELECT count(*)::int FROM imports WHERE workspace_id = $1)                     AS imports,
         (SELECT count(*)::int FROM imports WHERE workspace_id = $1 AND status IN ('pending','processing')) AS active_imports`,
      [workspaceId]
    );

    return {
      data: {
        user: { id, email, name },
        workspace: {
          id: workspaceId,
          name: workspace?.name ?? 'My network',
          slug: workspace?.slug ?? null,
          role: workspaceRole,
          createdAt: workspace ? new Date(workspace.created_at).toISOString() : null,
        },
        onboarding: {
          hasConnections: Number(counts?.connections ?? 0) > 0,
          hasImports: Number(counts?.imports ?? 0) > 0,
          importInProgress: Number(counts?.active_imports ?? 0) > 0,
        },
      },
    };
  });
}
