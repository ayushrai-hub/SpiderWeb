import { Queue, Worker } from "bullmq";
import { config } from "./config.js";
import { getDb } from "@intel/shared";
import { analyticsSnapshots } from "@intel/database";

const connection = { connection: { host: config.redisHost, port: config.redisPort } };

export const analyticsQueue = new Queue("analytics", connection);

const worker = new Worker(
  "analytics",
  async (job) => {
    const { workspaceId, metricType } = job.data;
    console.log(`Computing analytics for workspace ${workspaceId}: ${metricType}`);

    const db = getDb();

    try {
      // TODO: Implement actual analytics computation
      // 1. Query relevant data
      // 2. Compute metrics
      // 3. Store in analytics_snapshots table
      // 4. Check alerts

      // For now, simulate computation
      await new Promise((resolve) => setTimeout(resolve, 500));

      const snapshot = {
        workspaceId,
        snapshotDate: new Date(),
        metricType,
        metricData: { value: Math.floor(Math.random() * 100) },
      };

      // Store snapshot
      await db.insert(analyticsSnapshots).values(snapshot);

      return { status: "completed", snapshot };
    } catch (error) {
      console.error(`Failed to compute analytics for workspace ${workspaceId}:`, error);
      throw error;
    }
  },
  {
    connection: { host: config.redisHost, port: config.redisPort },
    concurrency: 3,
  }
);

worker.on("completed", (job) => {
  console.log(`Analytics computed for workspace ${job.data.workspaceId}: ${job.data.metricType}`);
});

worker.on("failed", (job, err) => {
  console.error(`Analytics failed for workspace ${job?.data.workspaceId}:`, err);
});

console.log("Analytics worker started");
