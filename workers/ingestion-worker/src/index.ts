import { Queue, Worker } from "bullmq";
import type { Job } from "bullmq";
import { config } from "./config.js";
import { getDb } from "@intel/shared";
import { runIngestionPipeline, type IngestionPipeline } from "@intel/ingestion";

const connection = { connection: { host: config.redisHost, port: config.redisPort } };

export const ingestionQueue = new Queue("ingestion", connection);

interface ImportJobData {
  importId: string;
  workspaceId: string;
  userId: string;
  archivePath: string;
  filename: string;
  retry?: boolean;
}

function escapeString(str: string): string {
  return str.replace(/'/g, "''");
}

async function updateImportStatus(
  db: any,
  importId: string,
  status: string,
  metadata?: Record<string, any>
) {
  let metaUpdate = '';
  if (metadata) {
    const metaJson = JSON.stringify(metadata).replace(/'/g, "''");
    metaUpdate = `, metadata = '${metaJson}'::jsonb`;
  }

  await db.execute(`
    UPDATE imports 
    SET status = '${escapeString(status)}'${metaUpdate}
    WHERE id = '${importId}'
  `);
}

async function updateFileStatus(
  db: any,
  importId: string,
  filename: string,
  status: string,
  recordCount?: number,
  warnings?: string[],
  errors?: string[]
) {
  const warningsJson = warnings ? JSON.stringify(warnings).replace(/'/g, "''") : null;
  const errorsJson = errors ? JSON.stringify(errors).replace(/'/g, "''") : null;
  
  await db.execute(`
    UPDATE import_files 
    SET status = '${escapeString(status)}', 
        record_count = ${recordCount ?? 'record_count'},
        ${warningsJson ? `warnings = '${warningsJson}'::jsonb,` : ''}
        ${errorsJson ? `errors = '${errorsJson}'::jsonb,` : ''}
        updated_at = NOW()
    WHERE import_id = '${importId}' AND filename = '${escapeString(filename)}'
  `);
}

async function persistNormalizedData(
  db: any,
  workspaceId: string,
  importId: string,
  pipelineResult: IngestionPipeline
) {
  const { normalization } = pipelineResult;
  let peopleCreated = 0;
  let companiesCreated = 0;
  let connectionsCreated = 0;
  let messagesCreated = 0;
  let activitiesCreated = 0;
  let jobsCreated = 0;

  // Persist people
  for (const person of normalization.persons) {
    try {
      // Check if person already exists by name
      const existing = await db.execute(`
        SELECT id FROM people 
        WHERE workspace_id = '${workspaceId}' AND canonical_name = '${escapeString(person.fullName)}'
        LIMIT 1
      `);

      let personId: string;

      if (existing.length > 0) {
        personId = existing[0].id;
        // Update with new info if we have more data
        await db.execute(`
          UPDATE people SET
            first_name = COALESCE('${person.firstName ? escapeString(person.firstName) : ''}', first_name),
            last_name = COALESCE('${person.lastName ? escapeString(person.lastName) : ''}', last_name),
            headline = COALESCE('${person.title ? escapeString(person.title) : ''}', headline),
            location = COALESCE('${person.location ? escapeString(person.location) : ''}', location),
            profile_url = COALESCE('${person.profileUrl ? escapeString(person.profileUrl) : ''}', profile_url),
            updated_at = NOW()
          WHERE id = '${personId}'
        `);
      } else {
        // Insert new person
        const result = await db.execute(`
          INSERT INTO people (workspace_id, canonical_name, first_name, last_name, headline, location, profile_url, source_type, confidence, created_at, updated_at)
          VALUES ('${workspaceId}', '${escapeString(person.fullName)}', '${person.firstName ? escapeString(person.firstName) : ''}', '${person.lastName ? escapeString(person.lastName) : ''}', '${person.title ? escapeString(person.title) : ''}', '${person.location ? escapeString(person.location) : ''}', '${person.profileUrl ? escapeString(person.profileUrl) : ''}', 'linkedin', ${person.confidence}, NOW(), NOW())
          RETURNING id
        `);
        personId = result[0].id;
        peopleCreated++;
      }

      // Add person identifier (LinkedIn ID)
      if (person.linkedinId) {
        await db.execute(`
          INSERT INTO person_identifiers (person_id, identifier_type, identifier_value, source_type, confidence)
          VALUES ('${personId}', 'linkedin_id', '${escapeString(person.linkedinId)}', 'linkedin', ${person.confidence})
          ON CONFLICT (identifier_type, identifier_value) DO NOTHING
        `);
      }

      // Add email identifier
      if (person.email) {
        await db.execute(`
          INSERT INTO person_identifiers (person_id, identifier_type, identifier_value, source_type, confidence)
          VALUES ('${personId}', 'email', '${escapeString(person.email)}', 'linkedin', ${person.confidence})
          ON CONFLICT (identifier_type, identifier_value) DO NOTHING
        `);
      }
    } catch (err) {
      // Log but continue - partial failure is acceptable
      console.error(`Failed to persist person ${person.fullName}:`, err);
    }
  }

  // Persist companies
  for (const company of normalization.companies) {
    try {
      const existing = await db.execute(`
        SELECT id FROM companies 
        WHERE workspace_id = '${workspaceId}' AND canonical_name = '${escapeString(company.canonicalName)}'
        LIMIT 1
      `);

      let companyId: string;

      if (existing.length > 0) {
        companyId = existing[0].id;
        await db.execute(`
          UPDATE companies SET
            domain = COALESCE('${company.domain ? escapeString(company.domain) : ''}', domain),
            linkedin_url = COALESCE('${company.linkedinUrl ? escapeString(company.linkedinUrl) : ''}', linkedin_url),
            industry = COALESCE('${company.industry ? escapeString(company.industry) : ''}', industry),
            location = COALESCE('${company.location ? escapeString(company.location) : ''}', location),
            description = COALESCE('${company.description ? escapeString(company.description) : ''}', description),
            updated_at = NOW()
          WHERE id = '${companyId}'
        `);
      } else {
        const result = await db.execute(`
          INSERT INTO companies (workspace_id, canonical_name, domain, linkedin_url, industry, location, description, source_type, confidence, created_at, updated_at)
          VALUES ('${workspaceId}', '${escapeString(company.canonicalName)}', '${company.domain ? escapeString(company.domain) : ''}', '${company.linkedinUrl ? escapeString(company.linkedinUrl) : ''}', '${company.industry ? escapeString(company.industry) : ''}', '${company.location ? escapeString(company.location) : ''}', '${company.description ? escapeString(company.description) : ''}', 'linkedin', ${company.confidence}, NOW(), NOW())
          RETURNING id
        `);
        companyId = result[0].id;
        companiesCreated++;
      }
    } catch (err) {
      console.error(`Failed to persist company ${company.canonicalName}:`, err);
    }
  }

  // Persist connections
  for (let i = 0; i < normalization.connections.length; i++) {
    const conn = normalization.connections[i];
    const person = normalization.persons[i];
    
    try {
      // Find person ID
      const personResult = await db.execute(`
        SELECT id FROM people 
        WHERE workspace_id = '${workspaceId}' AND canonical_name = '${escapeString(person?.fullName || '')}'
        LIMIT 1
      `);

      if (personResult.length === 0) continue;

      const personId = personResult[0].id;

      // Check for existing connection
      const existingConnection = await db.execute(`
        SELECT id FROM connections 
        WHERE workspace_id = '${workspaceId}' AND person_id = '${personId}'
        LIMIT 1
      `);

      if (existingConnection.length === 0) {
        await db.execute(`
          INSERT INTO connections (workspace_id, person_id, connected_at, source_file, status)
          VALUES ('${workspaceId}', '${personId}', ${conn.connectedAt ? `'${conn.connectedAt.toISOString()}'` : 'NULL'}, '${escapeString(conn.sourceFile)}', '${escapeString(conn.status)}')
        `);
        connectionsCreated++;
      }
    } catch (err) {
      console.error(`Failed to persist connection:`, err);
    }
  }

  // Persist messages
  for (const message of normalization.messages) {
    try {
      // Create or find conversation
      const convResult = await db.execute(`
        INSERT INTO conversations (workspace_id, title, started_at, source_type)
        VALUES ('${workspaceId}', 'LinkedIn Import', NOW(), 'linkedin')
        RETURNING id
      `);

      const conversationId = convResult[0].id;

      await db.execute(`
        INSERT INTO messages (workspace_id, conversation_id, content, sent_at, direction, source_file)
        VALUES ('${workspaceId}', '${conversationId}', '${escapeString(message.content)}', ${message.sentAt ? `'${message.sentAt.toISOString()}'` : 'NULL'}, '${escapeString(message.direction)}', '${escapeString(message.sourceFile)}')
      `);
      
      messagesCreated++;
    } catch (err) {
      console.error(`Failed to persist message:`, err);
    }
  }

  // Persist activities
  for (const activity of normalization.activities) {
    try {
      await db.execute(`
        INSERT INTO activities (workspace_id, activity_type, content, content_url, created_at, source_file)
        VALUES ('${workspaceId}', '${escapeString(activity.activityType)}', ${activity.content ? `'${escapeString(activity.content)}'` : 'NULL'}, ${activity.contentUrl ? `'${escapeString(activity.contentUrl)}'` : 'NULL'}, ${activity.createdAt ? `'${activity.createdAt.toISOString()}'` : 'NOW()'}, '${escapeString(activity.sourceFile)}')
      `);
      activitiesCreated++;
    } catch (err) {
      console.error(`Failed to persist activity:`, err);
    }
  }

  // Persist jobs
  for (const job of normalization.jobs) {
    try {
      await db.execute(`
        INSERT INTO jobs (workspace_id, title, company_name, location, description, url, source_file, created_at)
        VALUES ('${workspaceId}', '${escapeString(job.title)}', ${job.company ? `'${escapeString(job.company)}'` : 'NULL'}, ${job.location ? `'${escapeString(job.location)}'` : 'NULL'}, ${job.description ? `'${escapeString(job.description)}'` : 'NULL'}, ${job.url ? `'${escapeString(job.url)}'` : 'NULL'}, '${escapeString(job.sourceFile)}', NOW())
      `);
      jobsCreated++;
    } catch (err) {
      console.error(`Failed to persist job:`, err);
    }
  }

  return {
    peopleCreated,
    companiesCreated,
    connectionsCreated,
    messagesCreated,
    activitiesCreated,
    jobsCreated,
  };
}

const worker = new Worker(
  "ingestion",
  async (job: Job<ImportJobData>) => {
    const { importId, workspaceId, archivePath } = job.data;
    const db = getDb();

    console.log(`[Ingestion] Processing import ${importId}`);

    try {
      // Update import status to processing
      await updateImportStatus(db, importId, 'processing', {
        started_at: new Date().toISOString(),
      });

      await job.updateProgress(10);

      // Run ingestion pipeline
      const pipelineResult = await runIngestionPipeline({
        workspaceId,
        importId,
        archivePath,
        tempDir: '/tmp',
        existingPersons: [],
        existingCompanies: [],
      });

      await job.updateProgress(60);

      // Check for pipeline failure
      if (pipelineResult.status === 'failed') {
        throw new Error(`Pipeline failed: ${pipelineResult.errors.join(', ')}`);
      }

      // Update file statuses
      for (const [filename, result] of pipelineResult.manifest.parseResults) {
        await updateFileStatus(
          db,
          importId,
          filename,
          result.errors.length > 0 ? 'failed' : 'completed',
          result.records.length,
          result.warnings,
          result.errors
        );
      }

      await job.updateProgress(70);

      // Persist normalized data to database
      const persistResult = await persistNormalizedData(
        db,
        workspaceId,
        importId,
        pipelineResult
      );

      await job.updateProgress(90);

      // Update import record with final stats
      const statsJson = JSON.stringify({
        files_detected: pipelineResult.stats.filesDetected,
        files_processed: pipelineResult.stats.filesProcessed,
        files_skipped: pipelineResult.stats.filesSkipped,
        records_processed: pipelineResult.stats.recordsProcessed,
        persons_created: persistResult.peopleCreated,
        companies_created: persistResult.companiesCreated,
        connections_created: persistResult.connectionsCreated,
        messages_created: persistResult.messagesCreated,
        activities_created: persistResult.activitiesCreated,
        jobs_created: persistResult.jobsCreated,
        warnings: pipelineResult.stats.warnings,
        errors: pipelineResult.stats.errors,
      }).replace(/'/g, "''");

      await db.execute(`
        UPDATE imports SET 
          status = 'completed',
          file_count = ${pipelineResult.stats.filesProcessed},
          record_count = ${pipelineResult.stats.recordsProcessed},
          error_count = ${pipelineResult.stats.errors},
          warning_count = ${pipelineResult.stats.warnings},
          processing_completed_at = NOW(),
          metadata = jsonb_set(COALESCE(metadata, '{}'), '{stats}', '${statsJson}'::jsonb)
        WHERE id = '${importId}'
      `);

      await job.updateProgress(100);

      console.log(`[Ingestion] Import ${importId} completed successfully`);

      return {
        status: "completed",
        importId,
        stats: pipelineResult.stats,
        persistResult,
      };
    } catch (error) {
      console.error(`[Ingestion] Import ${importId} failed:`, error);

      // Update import status to failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await db.execute(`
        UPDATE imports SET 
          status = 'failed',
          metadata = jsonb_set(COALESCE(metadata, '{}'), '{error}', '"${escapeString(errorMessage)}"'::jsonb)
        WHERE id = '${importId}'
      `);

      throw error;
    }
  },
  {
    connection: { host: config.redisHost, port: config.redisPort },
    concurrency: 2,
    limiter: {
      max: 5,
      duration: 60000, // Max 5 jobs per minute
    },
  }
);

worker.on("completed", (job) => {
  console.log(`[Ingestion] Import ${job.data.importId} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[Ingestion] Import ${job?.data.importId} failed:`, err.message);
});

worker.on("stalled", (jobId) => {
  console.warn(`[Ingestion] Job ${jobId} stalled`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Ingestion] Shutting down worker...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Ingestion] Shutting down worker...');
  await worker.close();
  process.exit(0);
});

console.log("[Ingestion] Worker started");
