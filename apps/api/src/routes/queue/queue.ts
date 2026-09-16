import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/authorize.js";
import {
  scheduleRecurringJobs,
  cleanOldJobs,
  getQueueStats,
} from "../../services/queue.js";

export default async function queueRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // Get queue statistics
  app.get("/", {
    preHandler: [requireRole("owner", "admin")],
  }, async (_request, reply) => {
    try {
      const stats = await getQueueStats();
      return { data: stats };
    } catch {
      return reply.status(500).send({
        error: { message: "Failed to get queue stats" },
      });
    }
  });

  // Schedule recurring jobs
  app.post("/schedule", {
    preHandler: [requireRole("owner")],
  }, async (_request, reply) => {
    try {
      await scheduleRecurringJobs();
      return { data: { scheduled: true } };
    } catch {
      return reply.status(500).send({
        error: { message: "Failed to schedule jobs" },
      });
    }
  });

  // Clean old jobs
  app.post("/clean", {
    preHandler: [requireRole("owner")],
  }, async (_request, reply) => {
    try {
      await cleanOldJobs();
      return { data: { cleaned: true } };
    } catch {
      return reply.status(500).send({
        error: { message: "Failed to clean jobs" },
      });
    }
  });
}
