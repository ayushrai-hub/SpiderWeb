import type { FastifyRequest, FastifyReply } from 'fastify';
import { getSupabase, type AuthUser } from '@intel/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      },
    });
  }

  const token = authHeader.slice(7);

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
        },
      });
    }

    // Extract workspace_id from JWT metadata or query
    const workspaceId = request.headers['x-workspace-id'] as string;

    if (!workspaceId) {
      return reply.status(400).send({
        error: {
          code: 'WORKSPACE_REQUIRED',
          message: 'X-Workspace-Id header is required',
        },
      });
    }

    // Verify workspace membership
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('user_id', data.user.id)
      .eq('workspace_id', workspaceId)
      .single();

    if (membershipError || !membership) {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Not a member of this workspace',
        },
      });
    }

    request.user = {
      id: data.user.id,
      email: data.user.email || '',
      workspaceId,
      workspaceRole: membership.role,
    };
  } catch (err) {
    request.log.error(err, 'Auth middleware error');
    return reply.status(500).send({
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication service error',
      },
    });
  }
}
