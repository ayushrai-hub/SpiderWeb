import { extractArchive, parseExtractedFiles, cleanupExtractedFiles, type IngestionManifest } from './archive-handler.js';
import { normalizeData, type NormalizationResult } from './normalizer.js';
import { resolveEntities, type ResolutionResult } from './entity-resolution.js';

export interface IngestionPipeline {
  manifest: IngestionManifest;
  normalization: NormalizationResult;
  resolution: ResolutionResult;
  stats: IngestionStats;
  status: 'pending' | 'extracting' | 'parsing' | 'normalizing' | 'resolving' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  errors: string[];
  warnings: string[];
}

export interface IngestionStats {
  filesDetected: number;
  filesProcessed: number;
  filesSkipped: number;
  recordsProcessed: number;
  recordsSkipped: number;
  personsCreated: number;
  companiesCreated: number;
  connectionsCreated: number;
  messagesCreated: number;
  activitiesCreated: number;
  jobsCreated: number;
  employmentCreated: number;
  educationCreated: number;
  skillsCreated: number;
  entitiesMatched: number;
  entitiesPossible: number;
  entitiesUnresolved: number;
  warnings: number;
  errors: number;
}

export interface IngestionOptions {
  workspaceId: string;
  importId: string;
  archivePath: string;
  tempDir?: string;
  existingPersons?: any[];
  existingCompanies?: any[];
}

export async function runIngestionPipeline(
  options: IngestionOptions
): Promise<IngestionPipeline> {
  const {
    workspaceId,
    importId,
    archivePath,
    tempDir = '/tmp',
    existingPersons = [],
    existingCompanies = [],
  } = options;

  const pipeline: IngestionPipeline = {
    manifest: null as any,
    normalization: null as any,
    resolution: null as any,
    stats: {
      filesDetected: 0,
      filesProcessed: 0,
      filesSkipped: 0,
      recordsProcessed: 0,
      recordsSkipped: 0,
      personsCreated: 0,
      companiesCreated: 0,
      connectionsCreated: 0,
      messagesCreated: 0,
      activitiesCreated: 0,
      jobsCreated: 0,
      employmentCreated: 0,
      educationCreated: 0,
      skillsCreated: 0,
      entitiesMatched: 0,
      entitiesPossible: 0,
      entitiesUnresolved: 0,
      warnings: 0,
      errors: 0,
    },
    status: 'pending',
    startTime: new Date(),
    errors: [],
    warnings: [],
  };

  try {
    // Step 1: Extract and inventory (safe streaming extraction)
    pipeline.status = 'extracting';
    pipeline.manifest = extractArchive(archivePath, importId, tempDir);
    pipeline.stats.filesDetected = pipeline.manifest.inventory.totalFiles;

    // Step 2: Parse supported files only
    pipeline.status = 'parsing';
    parseExtractedFiles(pipeline.manifest);
    pipeline.stats.filesProcessed = pipeline.manifest.inventory.knownFiles;
    pipeline.stats.filesSkipped = pipeline.manifest.inventory.unknownFiles + pipeline.manifest.inventory.optionalFiles;
    
    // Count records
    for (const [, result] of pipeline.manifest.parseResults) {
      pipeline.stats.recordsProcessed += result.records.length;
      pipeline.stats.warnings += result.warnings.length;
      pipeline.stats.errors += result.errors.length;
    }

    // Step 3: Normalize
    pipeline.status = 'normalizing';
    pipeline.normalization = normalizeData(pipeline.manifest.parseResults, workspaceId);
    
    // Step 4: Entity resolution
    pipeline.status = 'resolving';
    pipeline.resolution = resolveEntities(
      pipeline.normalization.persons,
      pipeline.normalization.companies,
      existingPersons,
      existingCompanies
    );

    // Calculate final stats
    pipeline.stats.personsCreated = pipeline.normalization.persons.length;
    pipeline.stats.companiesCreated = pipeline.normalization.companies.length;
    pipeline.stats.connectionsCreated = pipeline.normalization.connections.length;
    pipeline.stats.messagesCreated = pipeline.normalization.messages.length;
    pipeline.stats.activitiesCreated = pipeline.normalization.activities.length;
    pipeline.stats.jobsCreated = pipeline.normalization.jobs.length;
    pipeline.stats.employmentCreated = pipeline.normalization.employment.length;
    pipeline.stats.educationCreated = pipeline.normalization.education.length;
    pipeline.stats.skillsCreated = pipeline.normalization.skills.length;
    pipeline.stats.entitiesMatched = pipeline.resolution.stats.matchedPersons + pipeline.resolution.stats.matchedCompanies;
    pipeline.stats.entitiesPossible = pipeline.resolution.stats.possiblePersons + pipeline.resolution.stats.possibleCompanies;
    pipeline.stats.entitiesUnresolved = pipeline.resolution.stats.unresolvedPersons + pipeline.resolution.stats.unresolvedCompanies;
    pipeline.stats.warnings = pipeline.normalization.warnings.length;
    pipeline.stats.errors = pipeline.normalization.errors.length;

    pipeline.status = 'completed';
    pipeline.endTime = new Date();
    pipeline.duration = pipeline.endTime.getTime() - pipeline.startTime.getTime();

    // Cleanup
    cleanupExtractedFiles(pipeline.manifest);

  } catch (err) {
    const error = err as Error;
    pipeline.status = 'failed';
    pipeline.errors.push(error.message);
    pipeline.endTime = new Date();
    pipeline.duration = pipeline.endTime.getTime() - pipeline.startTime.getTime();
  }

  return pipeline;
}

export function formatIngestionSummary(pipeline: IngestionPipeline): string {
  const stats = pipeline.stats;
  
  return `
=== Ingestion Summary ===
Status: ${pipeline.status}
Duration: ${pipeline.duration || 0}ms

Files:
  Detected: ${stats.filesDetected}
  Processed: ${stats.filesProcessed}
  Skipped: ${stats.filesSkipped}

Records:
  Processed: ${stats.recordsProcessed}
  Skipped: ${stats.recordsSkipped}

Entities Created:
  Persons: ${stats.personsCreated}
  Companies: ${stats.companiesCreated}
  Connections: ${stats.connectionsCreated}
  Messages: ${stats.messagesCreated}
  Activities: ${stats.activitiesCreated}
  Jobs: ${stats.jobsCreated}
  Education: ${stats.educationCreated}
  Skills: ${stats.skillsCreated}

Entity Resolution:
  Matched: ${stats.entitiesMatched}
  Possible: ${stats.entitiesPossible}
  Unresolved: ${stats.entitiesUnresolved}

Issues:
  Warnings: ${stats.warnings}
  Errors: ${stats.errors}
`.trim();
}
