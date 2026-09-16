import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { loadEnv, createSupabaseClient } from '@intel/shared';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth/signup.js';
import { workspaceRoutes } from './routes/workspace/workspaces.js';
import { importRoutes } from './routes/import/imports.js';
import { peopleRoutes } from './routes/people/people.js';
import { companiesRoutes } from './routes/company/companies.js';
import { messagesRoutes } from './routes/message/messages.js';
import { conversationsRoutes } from './routes/conversation/conversations.js';
import { jobsRoutes } from './routes/job/jobs.js';
import { analyticsRoutes } from './routes/analytics/analytics.js';
import { searchRoutes } from './routes/search/search.js';
import { aiChatRoutes } from './routes/ai/ai-chat.js';
import { credentialRoutes } from './routes/ai/credentials.js';
import { graphRoutes } from './routes/graph/graph.js';
import alertRoutes from './routes/alerts/alerts.js';
import queueRoutes from './routes/queue/queue.js';
import { errorHandler } from './middleware/error-handler.js';
import { apiRateLimit } from './middleware/rate-limit.js';
import { setupGracefulShutdown } from './shutdown.js';

const env = loadEnv();

// Initialize Supabase client
if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
  createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  },
  bodyLimit: 50 * 1024 * 1024, // 50MB for file uploads
});

app.register(cors, {
  origin: env.CORS_ORIGIN,
  credentials: true,
});

// Multipart file uploads
app.register(multipart, {
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max
    files: 1,
  },
});

// Rate limiting
app.addHook('preHandler', apiRateLimit);

// Error handler (must be registered before routes)
app.register(errorHandler);

// Register routes
app.register(healthRoutes);
app.register(authRoutes);
app.register(workspaceRoutes);
app.register(importRoutes);
app.register(peopleRoutes);
app.register(companiesRoutes);
app.register(messagesRoutes);
app.register(conversationsRoutes);
app.register(jobsRoutes);
app.register(analyticsRoutes);
app.register(searchRoutes);
app.register(aiChatRoutes);
app.register(credentialRoutes);
app.register(graphRoutes);
app.register(alertRoutes, { prefix: "/api/v1/alerts" });
app.register(queueRoutes, { prefix: "/api/v1/queue" });

// Graceful shutdown
setupGracefulShutdown(app);

const start = async () => {
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`API server running on ${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
