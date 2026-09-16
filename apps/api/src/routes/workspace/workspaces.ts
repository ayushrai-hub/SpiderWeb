import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getSupabase, createSupabaseAdmin, loadEnv } from '@intel/shared';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/authorize.js';

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
});

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
});

const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const error = new Error('Validation failed') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }
  return result.data;
}

export async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  // All workspace routes require authentication
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/workspaces', async (request, reply) => {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('workspace_members')
      .select(`
        role,
        workspace:workspaces (
          id,
          name,
          slug,
          created_at
        )
      `)
      .eq('user_id', request.user.id);

    if (error) {
      return reply.status(500).send({
        error: {
          code: 'WORKSPACE_LIST_FAILED',
          message: error.message,
        },
      });
    }

    interface WorkspaceMemberRow {
      role: string;
      workspace: { id: string; name: string; slug: string; created_at: string }[];
    }
    const workspaces = (data as WorkspaceMemberRow[]).map((m) => ({
      ...m.workspace,
      role: m.role,
    }));

    return reply.send({ data: workspaces });
  });

  app.post('/api/v1/workspaces', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = validate(createWorkspaceSchema, request.body);
    const env = loadEnv();
    const admin = createSupabaseAdmin(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const { data: workspace, error: wsError } = await admin
      .from('workspaces')
      .insert({
        name: body.name,
        slug,
        owner_id: request.user.id,
      })
      .select()
      .single();

    if (wsError) {
      return reply.status(400).send({
        error: {
          code: 'WORKSPACE_CREATE_FAILED',
          message: wsError.message,
        },
      });
    }

    // Add creator as owner
    await admin.from('workspace_members').insert({
      workspace_id: workspace.id,
      user_id: request.user.id,
      role: 'owner',
    });

    return reply.status(201).send({ data: workspace });
  });

  app.get('/api/v1/workspaces/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return reply.status(404).send({
        error: {
          code: 'WORKSPACE_NOT_FOUND',
          message: 'Workspace not found',
        },
      });
    }

    return reply.send({ data });
  });

  app.get('/api/v1/workspaces/:id/members', async (request, reply) => {
    const { id } = request.params as { id: string };
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('workspace_members')
      .select(`
        id,
        role,
        created_at,
        user:users (
          id,
          email,
          name,
          avatar_url
        )
      `)
      .eq('workspace_id', id);

    if (error) {
      return reply.status(500).send({
        error: {
          code: 'MEMBERS_LIST_FAILED',
          message: error.message,
        },
      });
    }

    return reply.send({ data });
  });

  app.post(
    '/api/v1/workspaces/:id/members',
    { preHandler: [requireRole('owner', 'admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = validate(inviteMemberSchema, request.body);
      const env = loadEnv();
      const admin = createSupabaseAdmin(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

      // Find user by email
      const { data: userData, error: userError } = await admin
        .from('users')
        .select('id')
        .eq('email', body.email)
        .single();

      if (userError || !userData) {
        return reply.status(404).send({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found. They must sign up first.',
          },
        });
      }

      // Check if already a member
      const { data: existing } = await admin
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', id)
        .eq('user_id', userData.id)
        .single();

      if (existing) {
        return reply.status(409).send({
          error: {
            code: 'ALREADY_MEMBER',
            message: 'User is already a member of this workspace',
          },
        });
      }

      const { data: membership, error: memberError } = await admin
        .from('workspace_members')
        .insert({
          workspace_id: id,
          user_id: userData.id,
          role: body.role,
        })
        .select()
        .single();

      if (memberError) {
        return reply.status(400).send({
          error: {
            code: 'INVITE_FAILED',
            message: memberError.message,
          },
        });
      }

      return reply.status(201).send({ data: membership });
    },
  );

  app.patch(
    '/api/v1/workspaces/:id/members/:memberId',
    { preHandler: [requireRole('owner')] },
    async (request, reply) => {
      const { id, memberId } = request.params as { id: string; memberId: string };
      const body = validate(updateMemberRoleSchema, request.body);
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from('workspace_members')
        .update({ role: body.role })
        .eq('workspace_id', id)
        .eq('id', memberId)
        .select()
        .single();

      if (error) {
        return reply.status(400).send({
          error: {
            code: 'ROLE_UPDATE_FAILED',
            message: error.message,
          },
        });
      }

      return reply.send({ data });
    },
  );

  app.delete(
    '/api/v1/workspaces/:id/members/:memberId',
    { preHandler: [requireRole('owner', 'admin')] },
    async (request, reply) => {
      const { id, memberId } = request.params as { id: string; memberId: string };
      const supabase = getSupabase();

      const { error } = await supabase
        .from('workspace_members')
        .delete()
        .eq('workspace_id', id)
        .eq('id', memberId);

      if (error) {
        return reply.status(400).send({
          error: {
            code: 'MEMBER_REMOVE_FAILED',
            message: error.message,
          },
        });
      }

      return reply.send({ data: { message: 'Member removed' } });
    },
  );
}
