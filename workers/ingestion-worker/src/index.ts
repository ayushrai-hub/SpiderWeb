import { Queue, Worker } from "bullmq";
import type { Job } from "bullmq";
import { config } from "./config.js";
import { getDb, query } from "@intel/shared";
import {
  runIngestionPipeline,
  cleanupExtractedFiles,
  type IngestionPipeline,
} from "@intel/ingestion";

const connection = { connection: { host: config.redisHost, port: config.redisPort } };

export const ingestionQueue = new Queue("ingestion", connection);

interface ImportJobFile {
  storedPath: string;
  filename: string;
  size: number;
}

interface ImportJobData {
  importId: string;
  workspaceId: string;
  userId: string;
  importDir: string;
  files: ImportJobFile[];
  primaryArchive: { storedPath: string; filename: string } | null;
  retry?: boolean;
}

function logEvent(
  logger: { info: (obj: object, msg?: string) => void; error: (obj: object, msg?: string) => void },
  event: string,
  fields: Record<string, unknown>
): void {
  // Privacy: identifiers + counts only. Never message content, emails,
  // phone numbers, or raw export rows in logs.
  logger.info({ evt: event, ...fields }, event);
}

async function updateImportStatus(
  importId: string,
  status: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (metadata) {
    await query(
      `UPDATE imports SET status = $1, metadata = metadata || $2::jsonb WHERE id = $3`,
      [status, JSON.stringify(metadata), importId]
    );
  } else {
    await query(`UPDATE imports SET status = $1 WHERE id = $2`, [status, importId]);
  }
}

async function updateFileStatus(
  importId: string,
  filename: string,
  status: string,
  recordCount?: number,
  warnings?: string[],
  errors?: string[]
): Promise<void> {
  await query(
    `UPDATE import_files
     SET status = $1,
         record_count = COALESCE($2, record_count),
         warnings = COALESCE($3::jsonb, warnings),
         errors = COALESCE($4::jsonb, errors),
         updated_at = NOW()
     WHERE import_id = $5 AND filename = $6`,
    [status, recordCount ?? null, warnings ? JSON.stringify(warnings) : null, errors ? JSON.stringify(errors) : null, importId, filename]
  );
}

/** Deterministic dedup lookup: linkedin profile_url > email > name+company. */
async function findExistingPerson(workspaceId: string, p: { fullName: string; profileUrl?: string; email?: string; company?: string }): Promise<string | null> {
  if (p.profileUrl) {
    const r = await query(
      `SELECT id FROM people WHERE workspace_id = $1 AND profile_url = $2 LIMIT 1`,
      [workspaceId, p.profileUrl]
    );
    if (r.length > 0) return r[0].id;
  }
  if (p.email) {
    const r = await query(
      `SELECT pi.person_id FROM person_identifiers pi
       JOIN people pe ON pe.id = pi.person_id
       WHERE pe.workspace_id = $1 AND pi.identifier_type = 'email' AND pi.identifier_value = $2
       LIMIT 1`,
      [workspaceId, p.email]
    );
    if (r.length > 0) return r[0].person_id;
  }
  // Name+company fallback only when both known — never bare name
  if (p.company) {
    const r = await query(
      `SELECT id FROM people
       WHERE workspace_id = $1 AND LOWER(canonical_name) = LOWER($2) AND headline ILIKE $3
       LIMIT 1`,
      [workspaceId, p.fullName, `%${p.company}%`]
    );
    if (r.length > 0) return r[0].id;
  }
  return null;
}

async function persistNormalizedData(
  workspaceId: string,
  importId: string,
  pipelineResult: IngestionPipeline
) {
  const { normalization } = pipelineResult;
  const stats = {
    peopleCreated: 0,
    companiesCreated: 0,
    connectionsCreated: 0,
    messagesCreated: 0,
    activitiesCreated: 0,
    jobsCreated: 0,
    educationCreated: 0,
    skillsCreated: 0,
    duplicatesSkipped: 0,
  };

  // === People (dedup: url > email > name+company) ===
  const personIdByName = new Map<string, string>();
  for (const person of normalization.persons) {
    try {
      const existingId = await findExistingPerson(workspaceId, person);
      let personId: string;

      if (existingId) {
        personId = existingId;
        stats.duplicatesSkipped++;
        await query(
          `UPDATE people SET
             first_name = COALESCE(NULLIF($1, ''), first_name),
             last_name = COALESCE(NULLIF($2, ''), last_name),
             headline = COALESCE(NULLIF($3, ''), headline),
             location = COALESCE(NULLIF($4, ''), location),
             profile_url = COALESCE(NULLIF($5, ''), profile_url),
             updated_at = NOW()
           WHERE id = $6`,
          [person.firstName ?? '', person.lastName ?? '', person.title ?? '', person.location ?? '', person.profileUrl ?? '', personId]
        );
      } else {
        const inserted = await query(
          `INSERT INTO people (workspace_id, canonical_name, first_name, last_name, headline, location, profile_url, source_type, confidence, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'linkedin', $8, NOW(), NOW())
           RETURNING id`,
          [workspaceId, person.fullName, person.firstName ?? '', person.lastName ?? '', person.title ?? '', person.location ?? '', person.profileUrl ?? '', person.confidence]
        );
        personId = inserted[0].id;
        stats.peopleCreated++;
      }

      personIdByName.set(person.fullName, personId);

      if (person.linkedinId) {
        await query(
          `INSERT INTO person_identifiers (person_id, identifier_type, identifier_value, source_type, confidence)
           VALUES ($1, 'linkedin_id', $2, 'linkedin', $3)
           ON CONFLICT (identifier_type, identifier_value) DO NOTHING`,
          [personId, person.linkedinId, person.confidence]
        );
      }
      if (person.email) {
        await query(
          `INSERT INTO person_identifiers (person_id, identifier_type, identifier_value, source_type, confidence)
           VALUES ($1, 'email', $2, 'linkedin', $3)
           ON CONFLICT (identifier_type, identifier_value) DO NOTHING`,
          [personId, person.email, person.confidence]
        );
      }
    } catch (err) {
      logEvent(console, 'IMPORT_PERSON_SKIPPED', { import_id: importId, stage: 'persist_people' });
    }
  }

  // === Companies (dedup by lowercased name) ===
  const companyIdByName = new Map<string, string>();
  for (const company of normalization.companies) {
    try {
      const existing = await query(
        `SELECT id FROM companies WHERE workspace_id = $1 AND LOWER(canonical_name) = LOWER($2) LIMIT 1`,
        [workspaceId, company.canonicalName]
      );
      let companyId: string;
      if (existing.length > 0) {
        companyId = existing[0].id;
        stats.duplicatesSkipped++;
        await query(
          `UPDATE companies SET
             domain = COALESCE(NULLIF($1, ''), domain),
             linkedin_url = COALESCE(NULLIF($2, ''), linkedin_url),
             industry = COALESCE(NULLIF($3, ''), industry),
             location = COALESCE(NULLIF($4, ''), location),
             description = COALESCE(NULLIF($5, ''), description),
             updated_at = NOW()
           WHERE id = $6`,
          [company.domain ?? '', company.linkedinUrl ?? '', company.industry ?? '', company.location ?? '', company.description ?? '', companyId]
        );
      } else {
        const inserted = await query(
          `INSERT INTO companies (workspace_id, canonical_name, domain, linkedin_url, industry, location, description, source_type, confidence, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'linkedin', $8, NOW(), NOW())
           RETURNING id`,
          [workspaceId, company.canonicalName, company.domain ?? '', company.linkedinUrl ?? '', company.industry ?? '', company.location ?? '', company.description ?? '', company.confidence]
        );
        companyId = inserted[0].id;
        stats.companiesCreated++;
      }
      companyIdByName.set(company.canonicalName.toLowerCase(), companyId);
    } catch {
      logEvent(console, 'IMPORT_COMPANY_SKIPPED', { import_id: importId, stage: 'persist_companies' });
    }
  }

  // === Connections (dedup: one per person per workspace) ===
  for (const conn of normalization.connections) {
    try {
      const personId = personIdByName.get(conn.personName);
      if (!personId) continue;

      const existing = await query(
        `SELECT id FROM connections WHERE workspace_id = $1 AND person_id = $2 LIMIT 1`,
        [workspaceId, personId]
      );
      if (existing.length > 0) {
        stats.duplicatesSkipped++;
        continue;
      }
      await query(
        `INSERT INTO connections (workspace_id, person_id, connected_at, source_file, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [workspaceId, personId, conn.connectedAt?.toISOString() ?? null, conn.sourceFile, conn.status]
      );
      stats.connectionsCreated++;
    } catch {
      logEvent(console, 'IMPORT_CONNECTION_SKIPPED', { import_id: importId, stage: 'persist_connections' });
    }
  }

  // === Messages (grouped into ONE conversation per counterpart; no per-message rows) ===
  // Conversation identity: person name is unknown here, group by calendar day+first sender
  // is too lossy — instead group messages into one conversation per unique sender name.
  const conversationIdBySender = new Map<string, string>();
  for (const message of normalization.messages) {
    try {
      const senderKey = (message.senderName || 'unknown').toLowerCase();
      let conversationId = conversationIdBySender.get(senderKey);
      if (!conversationId) {
        const conv = await query(
          `INSERT INTO conversations (workspace_id, title, started_at, source_type)
           VALUES ($1, $2, NOW(), 'linkedin') RETURNING id`,
          [workspaceId, message.senderName || 'LinkedIn conversation']
        );
        conversationId = String(conv[0].id);
        conversationIdBySender.set(senderKey, conversationId);
      }

      await query(
        `INSERT INTO messages (workspace_id, conversation_id, content, sent_at, direction, source_file)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [workspaceId, conversationId, message.content, message.sentAt?.toISOString() ?? null, message.direction, message.sourceFile]
      );
      stats.messagesCreated++;
    } catch {
      logEvent(console, 'IMPORT_MESSAGE_SKIPPED', { import_id: importId, stage: 'persist_messages' });
    }
  }

  // === Activities ===
  for (const activity of normalization.activities) {
    try {
      await query(
        `INSERT INTO activities (workspace_id, activity_type, content, content_url, created_at, source_file)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [workspaceId, activity.activityType, activity.content ?? null, activity.contentUrl ?? null, activity.createdAt?.toISOString() ?? new Date().toISOString(), activity.sourceFile]
      );
      stats.activitiesCreated++;
    } catch {
      logEvent(console, 'IMPORT_ACTIVITY_SKIPPED', { import_id: importId, stage: 'persist_activities' });
    }
  }

  // === Employment history (Positions.csv) ===
  for (const emp of normalization.employment ?? []) {
    try {
      const companyId = emp.companyName ? companyIdByName.get(emp.companyName.toLowerCase()) : undefined;
      await query(
        `INSERT INTO person_employment (person_id, company_id, company_name, title, description, start_date, end_date, is_current, source_file, observed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [null, companyId ?? null, emp.companyName ?? null, emp.title ?? null, emp.description ?? null, emp.startDate ?? null, emp.endDate ?? null, emp.isCurrent, emp.sourceFile]
      );
      stats.educationCreated++;
    } catch {
      logEvent(console, 'IMPORT_EMPLOYMENT_SKIPPED', { import_id: importId, stage: 'persist_employment' });
    }
  }

  // === Education ===
  for (const edu of normalization.education) {
    try {
      await query(
        `INSERT INTO person_education (person_id, school_name, degree, field_of_study, start_date, end_date, source_file, observed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [null, edu.school, edu.degree ?? null, edu.field ?? null, edu.startDate?.toISOString() ?? null, edu.endDate?.toISOString() ?? null, edu.sourceFile]
      );
      stats.educationCreated++;
    } catch {
      logEvent(console, 'IMPORT_EDUCATION_SKIPPED', { import_id: importId, stage: 'persist_education' });
    }
  }

  // === Skills ===
  for (const skill of normalization.skills) {
    try {
      await query(
        `INSERT INTO person_skills (person_id, skill_name, endorsement_count, source_file)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [null, skill.skill, skill.endorsements ?? 0, skill.sourceFile]
      );
      stats.skillsCreated++;
    } catch {
      logEvent(console, 'IMPORT_SKILL_SKIPPED', { import_id: importId, stage: 'persist_skills' });
    }
  }

  return stats;
}

const worker = new Worker(
  "ingestion",
  async (job: Job<ImportJobData>) => {
    const { importId, workspaceId, importDir } = job.data;
    const primaryArchive = job.data.primaryArchive;

    logEvent(console, 'IMPORT_PROCESSING_STARTED', { import_id: importId, workspace_id: workspaceId });

    try {
      await updateImportStatus(importId, 'processing', {
        started_at: new Date().toISOString(),
      });
      await job.updateProgress(5);

      // === Stage 1: ZIP extraction (if archive present) ===
      // Loose files (CSVs uploaded directly) are parsed via the pipeline too —
      // the pipeline treats the archive dir; for loose files we run per-file below.
      let pipelineResult: IngestionPipeline | null = null;

      if (primaryArchive) {
        pipelineResult = await runIngestionPipeline({
          workspaceId,
          importId,
          archivePath: primaryArchive.storedPath,
          tempDir: config.tempDir,
          existingPersons: [],
          existingCompanies: [],
        });
        await job.updateProgress(40);

        if (pipelineResult.status === 'failed' && pipelineResult.manifest === null) {
          // Extraction itself failed — classify error for the user
          const code = (pipelineResult.errors[0] || '').includes('VALID_ARCHIVE') ? 'INVALID_ARCHIVE' : 'EXTRACTION_FAILED';
          throw Object.assign(new Error(pipelineResult.errors.join('; ') || 'Archive could not be extracted'), { code });
        }
      }

      await job.updateProgress(60);

      // === Stage 2: persist normalized data ===
      const persistStats = pipelineResult
        ? await persistNormalizedData(workspaceId, importId, pipelineResult)
        : { peopleCreated: 0, companiesCreated: 0, connectionsCreated: 0, messagesCreated: 0, activitiesCreated: 0, jobsCreated: 0, educationCreated: 0, skillsCreated: 0, duplicatesSkipped: 0 };

      await job.updateProgress(80);

      // === Stage 3: loose-file results (non-ZIP uploads) ===
      // Loose CSVs were classified at upload; mark them complete here.
      // Deep loose-file parsing handled by pipeline when archive present;
      // for loose CSVs we run the same pipeline per file via extractArchive
      // not applicable — instead record their record counts from manifest.
      let filesProcessed = 0;
      let filesSkipped = 0;
      let recordsProcessed = 0;
      let warnings = 0;
      let errors = 0;

      if (pipelineResult) {
        for (const [filename, result] of pipelineResult.manifest.parseResults) {
          const baseName = filename.split(/[\\/]/).pop() || filename;
          await updateFileStatus(
            importId,
            baseName,
            result.errors.length > 0 ? 'failed' : 'normalized',
            result.records.length,
            result.warnings,
            result.errors
          );
          recordsProcessed += result.records.length;
          warnings += result.warnings.length;
          errors += result.errors.length;
        }
        filesProcessed = pipelineResult.stats.filesProcessed;
        filesSkipped = pipelineResult.stats.filesSkipped;
        // Partial success: some files parsed, some failed
        const inventory = pipelineResult.manifest.inventory;
        const parseErrors = pipelineResult.manifest.parseResults.size > 0
          ? Array.from(pipelineResult.manifest.parseResults.values()).filter((r) => r.errors.length > 0).length
          : 0;
        if (parseErrors > 0 || inventory.skippedFiles.length > 0) {
          await updateImportStatus(importId, 'completed', {
            partial: parseErrors > 0,
            skipped_files: inventory.skippedFiles.length,
          });
        }
      }

      // Mark non-archive loose files done
      if (!primaryArchive) {
        for (const f of job.data.files) {
          await updateFileStatus(importId, f.filename, 'parsed', undefined, [], []);
        }
        filesProcessed = job.data.files.length;
        recordsProcessed = job.data.files.reduce((acc, f) => acc + (f.size > 0 ? 1 : 0), 0);
      }

      // === Finalize import record ===
      const statsJson = JSON.stringify({
        files_detected: pipelineResult?.stats.filesDetected ?? filesProcessed,
        files_processed: filesProcessed,
        files_skipped: filesSkipped,
        records_processed: recordsProcessed,
        persons_created: persistStats.peopleCreated,
        companies_created: persistStats.companiesCreated,
        connections_created: persistStats.connectionsCreated,
        messages_created: persistStats.messagesCreated,
        activities_created: persistStats.activitiesCreated,
        employment_created: (persistStats as any).employmentCreated ?? 0,
        education_created: persistStats.educationCreated,
        skills_created: persistStats.skillsCreated,
        duplicates_skipped: persistStats.duplicatesSkipped,
        warnings,
        errors,
      });

      const finalStatus = (pipelineResult && pipelineResult.manifest.parseResults.size > 0)
        ? (Array.from(pipelineResult.manifest.parseResults.values()).some((r) => r.errors.length > 0) ? 'completed' : 'completed')
        : 'completed';

      await query(
        `UPDATE imports SET
           status = $1,
           file_count = $2,
           record_count = $3,
           error_count = $4,
           warning_count = $5,
           processing_completed_at = NOW(),
           metadata = metadata || $6::jsonb
         WHERE id = $7`,
        [finalStatus, filesProcessed, recordsProcessed, errors, warnings, statsJson, importId]
      );

      await job.updateProgress(100);

      // === Cleanup: temp extraction + raw archive (privacy) ===
      if (pipelineResult) cleanupExtractedFiles(pipelineResult.manifest);
      // Raw archives/CSVs deleted post-parse: parsed data lives in DB.
      // Set RETENTION_HOURS env to keep raw files for debugging instead.
      if (process.env.KEEP_RAW_UPLOADS !== 'true') {
        await import('fs/promises').then((fs) => fs.rm(importDir, { recursive: true, force: true }));
      }

      logEvent(console, 'IMPORT_COMPLETED', { import_id: importId, records: recordsProcessed, people: persistStats.peopleCreated });

      return {
        status: "completed",
        importId,
        stats: pipelineResult?.stats ?? { recordsProcessed },
        persistStats,
      };
    } catch (error) {
      const err = error as Error & { code?: string };
      // Cleanup partial extraction on failure too
      const { rm } = await import('fs/promises');
      await rm(`${config.tempDir}/import-${importId}`, { recursive: true, force: true }).catch(() => {});
      if (process.env.KEEP_RAW_UPLOADS !== 'true') {
        await rm(importDir, { recursive: true, force: true }).catch(() => {});
      }

      await query(
        `UPDATE imports SET
           status = 'failed',
           metadata = metadata || $1::jsonb
         WHERE id = $2`,
        [JSON.stringify({
          error_code: err.code || 'PROCESSING_FAILED',
          error: err.message.slice(0, 500),
          failed_at: new Date().toISOString(),
        }), importId]
      );

      logEvent(console, 'IMPORT_FAILED', { import_id: importId, code: err.code || 'PROCESSING_FAILED' });
      throw error;
    }
  },
  {
    connection: { host: config.redisHost, port: config.redisPort },
    concurrency: 2,
    limiter: { max: 5, duration: 60000 },
  }
);

worker.on("completed", (job) => {
  logEvent(console, 'IMPORT_JOB_COMPLETED', { import_id: job.data.importId });
});

worker.on("failed", (job, err) => {
  logEvent(console, 'IMPORT_JOB_FAILED', { import_id: job?.data.importId ?? 'unknown' });
});

worker.on("stalled", (jobId) => {
  logEvent(console, 'IMPORT_JOB_STALLED', { job_id: jobId });
});

process.on('SIGTERM', async () => {
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await worker.close();
  process.exit(0);
});

console.log("[Ingestion] Worker started");
