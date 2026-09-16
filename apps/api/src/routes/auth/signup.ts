import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getSupabase, createSupabaseAdmin } from '@intel/shared';
import { loadEnv } from '@intel/shared';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const resetSchema = z.object({
  email: z.string().email(),
});

const verifySchema = z.object({
  token: z.string(),
  type: z.enum(['signup', 'magiclink', 'recovery']),
});

function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const error = new Error('Validation failed') as Error & { statusCode: number; validation: z.ZodError };
    error.statusCode = 400;
    error.validation = result.error;
    throw error;
  }
  return result.data;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const env = loadEnv();

  app.post('/api/v1/auth/signup', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = validate(signupSchema, request.body);
      const supabase = getSupabase();

      const { data, error } = await supabase.auth.signUp({
        email: body.email,
        password: body.password,
        options: {
          data: { name: body.name },
        },
      });

      if (error) {
        return reply.status(400).send({
          error: {
            code: 'SIGNUP_FAILED',
            message: error.message,
          },
        });
      }

      // Create workspace for new user
      if (data.user) {
        const admin = createSupabaseAdmin(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

        const { data: workspace, error: wsError } = await admin
          .from('workspaces')
          .insert({
            name: `${body.name || body.email}'s Workspace`,
            slug: body.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-'),
            owner_id: data.user.id,
          })
          .select()
          .single();

        if (!wsError && workspace) {
          await admin.from('workspace_members').insert({
            workspace_id: workspace.id,
            user_id: data.user.id,
            role: 'owner',
          });
        }
      }

      return reply.status(201).send({
        data: {
          user: data.user,
          session: data.session,
        },
      });
    } catch (err) {
      if (err instanceof Error && 'statusCode' in err) {
        const validationErr = err as Error & { statusCode: number; validation?: { errors: unknown[] } };
        return reply.status(validationErr.statusCode).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: validationErr.message,
            details: validationErr.validation?.errors,
          },
        });
      }
      throw err;
    }
  });

  app.post('/api/v1/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = validate(loginSchema, request.body);
      const supabase = getSupabase();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: body.email,
        password: body.password,
      });

      if (error) {
        return reply.status(401).send({
          error: {
            code: 'LOGIN_FAILED',
            message: error.message,
          },
        });
      }

      return reply.send({
        data: {
          user: data.user,
          session: data.session,
        },
      });
    } catch (err) {
      if (err instanceof Error && 'statusCode' in err) {
        const validationErr = err as Error & { statusCode: number };
        return reply.status(validationErr.statusCode).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: validationErr.message,
          },
        });
      }
      throw err;
    }
  });

  app.post('/api/v1/auth/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signOut();

      if (error) {
        return reply.status(500).send({
          error: {
            code: 'LOGOUT_FAILED',
            message: error.message,
          },
        });
      }

      return reply.send({ data: { message: 'Logged out' } });
    } catch {
      // SignOut can fail if no session, still return success
      return reply.send({ data: { message: 'Logged out' } });
    }
  });

  app.post('/api/v1/auth/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = validate(verifySchema, request.body);
      const supabase = getSupabase();

      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase.auth.verifyOtp({
        email: userData?.user?.email || '',
        token: body.token,
        type: body.type,
      });

      if (error) {
        return reply.status(400).send({
          error: {
            code: 'VERIFICATION_FAILED',
            message: error.message,
          },
        });
      }

      return reply.send({
        data: {
          user: data.user,
          session: data.session,
        },
      });
    } catch (err) {
      if (err instanceof Error && 'statusCode' in err) {
        const validationErr = err as Error & { statusCode: number };
        return reply.status(validationErr.statusCode).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: validationErr.message,
          },
        });
      }
      throw err;
    }
  });

  app.post('/api/v1/auth/reset', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = validate(resetSchema, request.body);
      const supabase = getSupabase();

      const { error } = await supabase.auth.resetPasswordForEmail(body.email, {
        redirectTo: `${env.CORS_ORIGIN}/reset-password`,
      });

      if (error) {
        return reply.status(400).send({
          error: {
            code: 'RESET_FAILED',
            message: error.message,
          },
        });
      }

      return reply.send({
        data: { message: 'Password reset email sent' },
      });
    } catch (err) {
      if (err instanceof Error && 'statusCode' in err) {
        const validationErr = err as Error & { statusCode: number };
        return reply.status(validationErr.statusCode).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: validationErr.message,
          },
        });
      }
      throw err;
    }
  });

  app.post('/api/v1/auth/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing refresh token',
        },
      });
    }

    const refreshToken = authHeader.slice(7);
    const supabase = getSupabase();

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      return reply.status(401).send({
        error: {
          code: 'REFRESH_FAILED',
          message: error.message,
        },
      });
    }

    return reply.send({
      data: {
        user: data.user,
        session: data.session,
      },
    });
  });
}
