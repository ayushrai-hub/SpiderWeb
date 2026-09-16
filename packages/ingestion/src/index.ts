// CSV Parser
export { parseCsv, detectDelimiter, detectEncoding } from './csv-parser.js';
export type { CsvParseOptions, CsvParseResult } from './csv-parser.js';

// LinkedIn Adapters
export { getLinkedInAdapters, matchAdapter, identifyFileType } from './linkedin/adapters.js';
export type { LinkedInAdapter } from './linkedin/adapters.js';

// Archive Handler
export { extractArchive, cleanupExtractedFiles } from './archive-handler.js';
export type { ArchiveInventory, ArchiveFile, IngestionManifest } from './archive-handler.js';

// Normalizer
export { normalizeData } from './normalizer.js';
export type {
  NormalizedPerson,
  NormalizedCompany,
  NormalizedConnection,
  NormalizedMessage,
  NormalizedActivity,
  NormalizedJob,
  NormalizedEducation,
  NormalizedSkill,
  NormalizedInsight,
  NormalizationResult,
} from './normalizer.js';

// Entity Resolution
export { resolveEntities } from './entity-resolution.js';
export type { EntityMatch, ResolutionResult } from './entity-resolution.js';

// Pipeline
export { runIngestionPipeline, formatIngestionSummary } from './pipeline.js';
export type { IngestionPipeline, IngestionStats, IngestionOptions } from './pipeline.js';
