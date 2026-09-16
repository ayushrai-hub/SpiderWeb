import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/authorize.js";
import {
  createAlertConfig,
  getAlertConfigs,
  getAlertConfig,
  updateAlertConfig,
  deleteAlertConfig,
  getAlertHistory,
  markAlertAsRead,
  getAlertDeliveryHistory,
  checkAlerts,
  type AlertType,
  type AlertChannel,
  type AlertFrequency,
} from "../../services/alerts.js";

export default async function alertRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // Get alert configurations
  app.get("/", async (request, reply) => {
    try {
      const workspaceId = request.user.workspaceId;
      const configs = await getAlertConfigs(workspaceId);

      return { data: configs };
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { message: error.message },
      });
    }
  });

  // Get single alert configuration
  app.get("/:id", async (request, reply) => {
    try {
      const workspaceId = request.user.workspaceId;
      const { id } = request.params as { id: string };

      const config = await getAlertConfig(workspaceId, id);
      if (!config) {
        return reply.status(404).send({ error: { message: "Alert not found" } });
      }

      return { data: config };
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { message: error.message },
      });
    }
  });

  // Create alert configuration
  app.post("/", {
    preHandler: [requireRole("owner", "admin")],
  }, async (request, reply) => {
    try {
      const workspaceId = request.user.workspaceId;
      const userId = request.user.id;
      const body = request.body as {
        name?: string;
        type?: AlertType;
        threshold?: number;
        metric?: string;
        channel?: AlertChannel;
        enabled?: boolean;
        frequency?: AlertFrequency;
      };

      if (!body.type || body.threshold === undefined || !body.channel) {
        return reply.status(400).send({
          error: { message: "type, threshold, and channel are required" },
        });
      }

      const config = await createAlertConfig(workspaceId, userId, {
        name: body.name || `${body.type} Alert`,
        type: body.type,
        conditions: {
          threshold: body.threshold,
          metric: body.metric || body.type,
        },
        channel: body.channel,
        enabled: body.enabled ?? true,
        frequency: body.frequency || "daily",
      });

      return reply.status(201).send({ data: config });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { message: error.message },
      });
    }
  });

  // Update alert configuration
  app.put("/:id", {
    preHandler: [requireRole("owner", "admin")],
  }, async (request, reply) => {
    try {
      const workspaceId = request.user.workspaceId;
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        threshold?: number;
        metric?: string;
        channel?: AlertChannel;
        enabled?: boolean;
        frequency?: AlertFrequency;
      };

      const updates: Record<string, any> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.channel !== undefined) updates.channel = body.channel;
      if (body.enabled !== undefined) updates.enabled = body.enabled;
      if (body.frequency !== undefined) updates.frequency = body.frequency;
      if (body.threshold !== undefined || body.metric !== undefined) {
        const existing = await getAlertConfig(workspaceId, id);
        if (existing) {
          updates.conditions = {
            threshold: body.threshold ?? existing.conditions.threshold,
            metric: body.metric ?? existing.conditions.metric,
          };
        }
      }

      const config = await updateAlertConfig(workspaceId, id, updates);
      if (!config) {
        return reply.status(404).send({ error: { message: "Alert not found" } });
      }

      return { data: config };
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { message: error.message },
      });
    }
  });

  // Delete alert configuration
  app.delete("/:id", {
    preHandler: [requireRole("owner", "admin")],
  }, async (request, reply) => {
    try {
      const workspaceId = request.user.workspaceId;
      const { id } = request.params as { id: string };

      const deleted = await deleteAlertConfig(workspaceId, id);
      if (!deleted) {
        return reply.status(404).send({ error: { message: "Alert not found" } });
      }

      return { data: { deleted: true } };
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { message: error.message },
      });
    }
  });

  // Get triggered alerts (from alerts table)
  app.get("/triggered", async (request, reply) => {
    try {
      const workspaceId = request.user.workspaceId;
      const { type, severity, since, limit, offset } = request.query as Record<string, unknown>;

      const result = await getAlertHistory(workspaceId, {
        type: type as AlertType,
        severity: severity as "info" | "warning" | "critical",
        since: since ? new Date(since as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });

      return { data: result.alerts, total: result.total };
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { message: error.message },
      });
    }
  });

  // Get alert history
  app.get("/history", async (request, reply) => {
    try {
      const workspaceId = request.user.workspaceId;
      const { type, severity, since, limit, offset } = request.query as Record<string, unknown>;

      const result = await getAlertHistory(workspaceId, {
        type: type as AlertType,
        severity: severity as "info" | "warning" | "critical",
        since: since ? new Date(since as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });

      return { data: result.alerts, total: result.total };
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { message: error.message },
      });
    }
  });

  // Mark alert as read
  app.put("/:id/read", async (request, reply) => {
    try {
      const workspaceId = request.user.workspaceId;
      const { id } = request.params as { id: string };

      const updated = await markAlertAsRead(workspaceId, id);
      if (!updated) {
        return reply.status(404).send({ error: { message: "Alert not found" } });
      }

      return { data: { read: true } };
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { message: error.message },
      });
    }
  });

  // Get alert delivery history
  app.get("/deliveries", {
    preHandler: [requireRole("owner", "admin")],
  }, async (request, reply) => {
    try {
      const workspaceId = request.user.workspaceId;
      const { configId } = request.query as { configId?: string };

      const deliveries = await getAlertDeliveryHistory(workspaceId, configId);

      return { data: deliveries };
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { message: error.message },
      });
    }
  });

  // Manually check alerts (for testing)
  app.post("/check", {
    preHandler: [requireRole("owner", "admin")],
  }, async (request, reply) => {
    try {
      const workspaceId = request.user.workspaceId;
      const { metrics } = request.body as Record<string, unknown>;

      const triggered = await checkAlerts(workspaceId, (metrics as Record<string, number>) || {});

      return { data: triggered };
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: { message: error.message },
      });
    }
  });
}
