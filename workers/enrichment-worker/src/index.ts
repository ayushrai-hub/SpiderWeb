import { Queue, Worker } from "bullmq";
import { config } from "./config.js";
import { getDb } from "@intel/shared";

const connection = { connection: { host: config.redisHost, port: config.redisPort } };

export const enrichmentQueue = new Queue("enrichment", connection);

const worker = new Worker(
  "enrichment",
  async (job) => {
    const { entityType, entityId, enrichmentType } = job.data;
    console.log(`Enriching ${entityType}:${entityId} with ${enrichmentType}`);

    const db = getDb();

    try {
      // TODO: Implement actual enrichment
      // 1. Fetch entity from database
      // 2. Call external API (Clearbit, Apollo, etc.)
      // 3. Update entity with enriched data
      // 4. Log enrichment activity

      // For now, simulate enrichment
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Update entity with enriched timestamp
      if (entityType === "person") {
        await db.execute(`
          UPDATE people 
          SET enriched_at = NOW(), metadata = COALESCE(metadata, '{}')::jsonb || '{"enrichmentType": "${enrichmentType}"}'::jsonb
          WHERE id = '${entityId}'
        `);
      } else if (entityType === "company") {
        await db.execute(`
          UPDATE companies 
          SET enriched_at = NOW(), metadata = COALESCE(metadata, '{}')::jsonb || '{"enrichmentType": "${enrichmentType}"}'::jsonb
          WHERE id = '${entityId}'
        `);
      }

      return { status: "completed", entityType, entityId };
    } catch (error) {
      console.error(`Failed to enrich ${entityType}:${entityId}:`, error);
      throw error;
    }
  },
  {
    connection: { host: config.redisHost, port: config.redisPort },
    concurrency: 5,
  }
);

worker.on("completed", (job) => {
  console.log(`Enriched ${job.data.entityType}:${job.data.entityId}`);
});

worker.on("failed", (job, err) => {
  console.error(`Enrichment failed for ${job?.data.entityType}:${job?.data.entityId}:`, err);
});

console.log("Enrichment worker started");
