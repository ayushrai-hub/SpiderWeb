// Text + date normalisation primitives
export {
  clean,
  cleanOptional,
  comparisonKey,
  normalizeName,
  fullName,
  normalizeProfileUrl,
  profileSlug,
  normalizeCompanyUrl,
  normalizeEmail,
  normalizePhone,
  normalizeCompanyName,
  companyKey,
  normalizeTitle,
  normalizeLocation,
  normalizeSchool,
  parseDate,
  toDateOnly,
  parseCount,
  truncate,
} from './text.js';

// CSV
export { parseCsvBuffer, parseCsvFile, detectDelimiter, detectEncoding, headerKey } from './csv-parser.js';
export type { CsvParseResult, ParseOptions } from './csv-parser.js';

// Dataset catalogue + detection
export {
  DATASETS,
  getDataset,
  detectDataset,
  matchByFilename,
  matchByHeaders,
  isIgnoredFilename,
  IGNORED_FILENAMES,
} from './datasets.js';
export type { DatasetKey, DatasetSpec, DatasetCategory } from './datasets.js';

// Archive handling
export { extractArchive, isZipFile, cleanupDir, ArchiveError, EXTRACTION_LIMITS } from './archive.js';
export type { ExtractedEntry, ExtractionResult } from './archive.js';

// Normalisation
export {
  normalizeDatasets,
  reconcileWeakIdentities,
  personKeyFor,
  emptyResult,
  SELF_KEY,
} from './normalize.js';
export type {
  NormalizationResult,
  ParsedDataset,
  CanonicalPerson,
  CanonicalCompany,
  CanonicalConnection,
  CanonicalEmployment,
  CanonicalEducation,
  CanonicalSkill,
  CanonicalMessage,
  CanonicalActivity,
  CanonicalJob,
  CanonicalInteraction,
  DatasetOutcome,
} from './normalize.js';

// Persistence + derivation
export { persist, emptyStats } from './persist.js';
export type { PersistStats, PersistContext } from './persist.js';
export { deriveIntelligence } from './derive.js';
export type { DerivationStats } from './derive.js';

// Orchestration
export { runImport } from './runner.js';
export type {
  RunImportOptions,
  ImportLogger,
  ImportOutcome,
  ImportFileOutcome,
  ImportStatus,
  UploadedFile,
} from './runner.js';
