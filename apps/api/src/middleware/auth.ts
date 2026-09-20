import type { FastifyReply, FastifyRequest } from 'fastify';
import { query, type AuthUser, type WorkspaceRole, isWorkspaceRole } from '@intel/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

/**
 * Identity.
 *
 * Sign-in is out of scope for this build, so the API runs as a single local
 * operator whose user and workspace are seeded on first request. Everything
 * downstream still goes through `request.user.workspaceId`, and every query is
 * scoped by it, so swapping this function for a real token verifier is the
 * only change needed to become multi-tenant.
 *
 * Deliberately NOT supported: a client-supplied workspace header. Trusting one
 * would let any caller read another workspace's imported data.
 */
const LOCAL_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'you@localhost',
  name: 'You',
} as const;

let seeding: Promise<AuthUser> | null = null;

async function seedLocalIdentity(): Promise<AuthUser> {
  await query(
    `INSERT INTO users (id, email, name) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
    [LOCAL_USER.id, LOCAL_USER.email, LOCAL_USER.name]
  );

  const existing = await query<{ workspace_id: string; role: string }>(
    `SELECT workspace_id, role FROM workspace_members WHERE user_id = $1 ORDER BY created_at LIMIT 1`,
    [LOCAL_USER.id]
  );
  if (existing.length > 0) {
    return {
      ...LOCAL_USER,
      workspaceId: existing[0].workspace_id,
      workspaceRole: isWorkspaceRole(existing[0].role) ? existing[0].role : 'member',
    };
  }

  const [workspace] = await query<{ id: string }>(
    `INSERT INTO workspaces (name, slug, owner_id) VALUES ('My network', $1, $2) RETURNING id`,
    [`ws-${LOCAL_USER.id.slice(0, 8)}`, LOCAL_USER.id]
  );
  await query(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [workspace.id, LOCAL_USER.id]
  );
  return { ...LOCAL_USER, workspaceId: workspace.id, workspaceRole: 'owner' };
}

export async function resolveIdentity(): Promise<AuthUser> {
  if (!seeding) {
    seeding = seedLocalIdentity().catch((err) => {
      seeding = null;
      throw err;
    });
  }
  return seeding;
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    request.user = await resolveIdentity();
  } catch (err) {
    request.log.error({ err }, 'Could not resolve the local workspace');
    return reply.status(503).send({
      error: {
        code: 'WORKSPACE_UNAVAILABLE',
        message:
          'The database is not reachable. Check that Postgres is running and migrations have been applied.',
      },
    });
  }
}

export function requireRole(...roles: WorkspaceRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Sign in required.' } });
    }
    if (!roles.includes(request.user.workspaceRole)) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: `This action requires one of: ${roles.join(', ')}.` },
      });
    }
  };
}
