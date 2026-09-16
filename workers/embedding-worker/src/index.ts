import { Queue, Worker } from "bullmq";
import { config } from "./config.js";
import { getLLMGateway } from "@intel/ai";

const connection = { connection: { host: config.redisHost, port: config.redisPort } };

export const embeddingQueue = new Queue("embedding", connection);

const worker = new Worker(
  "embedding",
  async (job) => {
    const { entityType, entityId, text, userId } = job.data;
    console.log(`Generating embedding for ${entityType}:${entityId}`);

    try {
      // Generate embedding using OpenAI
      const gateway = getLLMGateway();
      const response = await gateway.embed(userId, "openai", {
        model: "text-embedding-3-small",
        input: text,
      });
      const embedding = response.embeddings[0];

      // TODO: Store embedding in pgvector
      // For now, just log it
      console.log(`Generated embedding for ${entityType}:${entityId} (${embedding.length} dimensions)`);

      return { status: "completed", entityId, dimensions: embedding.length };
    } catch (error) {
      console.error(`Failed to generate embedding for ${entityType}:${entityId}:`, error);
      throw error;
    }
  },
  {
    connection: { host: config.redisHost, port: config.redisPort },
    concurrency: 10,
  }
);

worker.on("completed", (job) => {
  console.log(`Embedding generated for ${job.data.entityType}:${job.data.entityId}`);
});

worker.on("failed", (job, err) => {
  console.error(`Embedding failed for ${job?.data.entityType}:${job?.data.entityId}:`, err);
});

console.log("Embedding worker started");
