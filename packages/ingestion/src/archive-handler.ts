import { join, basename, resolve, sep } from 'path';
import { mkdirSync, rmSync, existsSync, readdirSync, statSync, writeFileSync, openSync, readSync, closeSync, readFileSync } from 'fs';
import { Unzip, UnzipInflate } from 'fflate';
import { matchAdapter, identifyFileType } from './linkedin/adapters.js';
import type { CsvParseResult } from './csv-parser.js';

export interface ArchiveInventory {
  files: ArchiveFile[];
  totalFiles: number;
  knownFiles: number;
  optionalFiles: number;
  unknownFiles: number;
  emptyFiles: number;
  skippedFiles: ArchiveFile[];
  errors: string[];
}

export interface ArchiveFile {
  filename: string; // sanitized relative path inside archive
  originalPath: string; // path as recorded in zip
  extractedPath?: string;
  extension: string;
  fileType: string;
  category: string;
  parser: string | null;
  size: number; // uncompressed size from zip metadata
  writtenBytes: number; // actual bytes written
  isSupported: boolean;
  isRequired: boolean;
  isKnown: boolean;
  isEmpty: boolean;
  status: 'supported' | 'optional' | 'skipped' | 'error';
  reason: string;
}

export interface IngestionManifest {
  importId: string;
  source: 'linkedin';
  archivePath: string;
  extractPath: string;
  inventory: ArchiveInventory;
  parseResults: Map<string, CsvParseResult>;
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'extracting' | 'parsing' | 'completed' | 'failed';
  warnings: string[];
  errors: string[];
}

// === Extraction safety limits ===
export const EXTRACTION_LIMITS = {
  maxUncompressedTotal: 1.5 * 1024 * 1024 * 1024, // 1.5GB total decompressed
  maxEntrySize: 512 * 1024 * 1024, // 512MB per entry
  maxEntries: 5000,
  maxDepth: 12, // nested folder depth guard
  maxPathLength: 400,
} as const;

const MAX_ARCHIVES_NESTED = 0; // do not recurse into inner zips
const ZIP_MAGIC = 0x04034b50; // PK\x03\x04

function isZipBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf.readUInt32LE(0) === ZIP_MAGIC;
}

/** Classify a single file: extension, category, parser, status + reason. */
export function classifyFile(relPath: string, size: number): ArchiveFile {
  const originalPath = relPath;
  const filename = basename(relPath);
  const ext = (filename.match(/\.[^.]+$/)?.[0] || '').toLowerCase();
  const adapter = matchAdapter(filename);
  const isZipLike = ['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext);

  // macOS junk + hidden files
  const isJunk =
    filename.startsWith('.') ||
    filename.startsWith('__MACOSX') ||
    filename === '.DS_Store' ||
    relPath.includes('__MACOSX/');

  let category = 'unknown';
  let parser: string | null = null;
  let status: ArchiveFile['status'] = 'skipped';
  let reason = '';

  if (isJunk) {
    status = 'skipped';
    reason = 'System/hidden file ignored';
  } else if (adapter) {
    category = adapter.fileType.toLowerCase().replace(/\s+/g, '_');
    parser = `linkedin_${adapter.fileType.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_v1`;
    status = 'supported';
    reason = 'Recognized LinkedIn export file';
  } else if (isZipLike) {
    status = 'skipped';
    reason = 'Nested archive not extracted (unsupported)';
    category = 'archive';
  } else if (['.csv', '.json', '.html'].includes(ext)) {
    status = 'optional';
    reason = 'LinkedIn-style file not yet recognized — stored for review';
    category = 'unrecognized';
  } else if (['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.mp4', '.bin'].includes(ext)) {
    status = 'skipped';
    reason = 'Media/binary file ignored';
    category = 'media';
  } else {
    status = 'skipped';
    reason = 'Unknown file type';
    category = 'unknown';
  }

  return {
    filename,
    originalPath,
    extension: ext,
    fileType: adapter ? adapter.fileType : 'Unknown',
    category,
    parser,
    size,
    writtenBytes: 0,
    isSupported: status === 'supported',
    isRequired: adapter?.required || false,
    isKnown: !!adapter,
    isEmpty: size === 0,
    status,
    reason,
  };
}

export class ArchiveError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Safe streaming ZIP extraction with fflate.
 * - Validates ZIP magic before extraction
 * - Refuses entries with `..` traversal, absolute paths, drive letters
 * - Enforces per-entry and total uncompressed size limits (bomb protection)
 * - Enforces entry-count and nesting-depth limits
 * - Never executes archive contents; text files only
 */
export function extractArchive(zipPath: string, importId: string, tempDir = '/tmp'): IngestionManifest {
  const manifest: IngestionManifest = {
    importId,
    source: 'linkedin',
    archivePath: zipPath,
    extractPath: join(tempDir, `import-${importId}`, 'extracted'),
    inventory: {
      files: [],
      totalFiles: 0,
      knownFiles: 0,
      optionalFiles: 0,
      unknownFiles: 0,
      emptyFiles: 0,
      skippedFiles: [],
      errors: [],
    },
    parseResults: new Map(),
    startTime: new Date(),
    status: 'pending',
    warnings: [],
    errors: [],
  };

  if (!existsSync(zipPath)) {
    throw new ArchiveError(`Archive not found: ${zipPath}`, 'ARCHIVE_NOT_FOUND');
  }

  const { size: archiveSize } = statSync(zipPath);
  if (archiveSize === 0) {
    throw new ArchiveError('Archive is empty (0 bytes)', 'EMPTY_ARCHIVE');
  }

  // Validate ZIP magic bytes before processing
  const magicBuf = Buffer.alloc(4);
  const fh = openSync(zipPath, 'r');
  readSync(fh, magicBuf, 0, 4, 0);
  closeSync(fh);
  if (!isZipBuffer(magicBuf)) {
    throw new ArchiveError(
      'File is not a valid ZIP archive (corrupted or wrong format)',
      'INVALID_ARCHIVE'
    );
  }

  mkdirSync(manifest.extractPath, { recursive: true });
  manifest.status = 'extracting';

  let totalWritten = 0; // across all entries (bomb guard)

  const zip = new Unzip((file) => {
    const nameStr = String(file.name ?? '');

    // Path traversal / zip-slip check
    const rel = nameStr.replace(/\\/g, '/');
    const isAbsolute = rel.startsWith('/') || /^[a-zA-Z]:/.test(rel);
    if (isAbsolute) {
      manifest.warnings.push(`Skipped absolute path entry: ${truncate(rel)}`);
      return;
    }
    const parts = rel.split('/').filter((p) => p.length > 0);
    if (parts.some((p) => p === '..')) {
      manifest.warnings.push(`Skipped path-traversal entry: ${truncate(rel)}`);
      return;
    }
    if (rel.length > EXTRACTION_LIMITS.maxPathLength) {
      manifest.warnings.push(`Skipped overlong path entry (${rel.length} chars)`);
      return;
    }
    if (parts.length > EXTRACTION_LIMITS.maxDepth) {
      manifest.warnings.push(`Skipped too-deep path entry (${parts.length} levels)`);
      return;
    }

    const safeRel = parts.join(sep);
    const outPath = resolve(manifest.extractPath, safeRel);
    if (!outPath.startsWith(resolve(manifest.extractPath) + sep)) {
      manifest.warnings.push(`Skipped escape attempt: ${truncate(rel)}`);
      return;
    }

    // Entry-count guard
    if (manifest.inventory.files.length >= EXTRACTION_LIMITS.maxEntries) {
      manifest.warnings.push(`Entry limit (${EXTRACTION_LIMITS.maxEntries}) reached; remaining entries skipped`);
      return;
    }

    const declSize = file.originalSize ?? 0;
    if (declSize > EXTRACTION_LIMITS.maxEntrySize) {
      manifest.warnings.push(`Entry exceeds ${Math.round(EXTRACTION_LIMITS.maxEntrySize / 1024 / 1024)}MB limit: ${truncate(basename(rel))}`);
      return;
    }

    // Classify first (cheap), then stream to disk
    const cls = classifyFile(rel, declSize);

    // Directories: record only
    if (rel.endsWith('/')) return;

    const fileInfo: ArchiveFile = { ...cls, extractedPath: outPath };
    manifest.inventory.files.push(fileInfo);
    manifest.inventory.totalFiles += 1;

    if (fileInfo.isSupported) manifest.inventory.knownFiles += 1;
    else if (fileInfo.status === 'optional') manifest.inventory.optionalFiles += 1;
    else manifest.inventory.unknownFiles += 1;
    if (fileInfo.status === 'skipped') manifest.inventory.skippedFiles.push(fileInfo);
    if (declSize === 0) manifest.inventory.emptyFiles += 1;

    if (fileInfo.status === 'skipped') return;

    // Buffer decompressed chunks, enforce limits, write on stream end.
    // Uses official fflate pattern: assign file.ondata then file.start().
    const chunks: Buffer[] = [];
    let written = 0;
    file.ondata = (err, data, final) => {
      if (err) throw err;
      const chunk: Buffer = Buffer.from(data ?? new Uint8Array());
      chunks.push(chunk);
      written += chunk.length;
      totalWritten += chunk.length;
      if (written > EXTRACTION_LIMITS.maxEntrySize) {
        throw new ArchiveError(
          `Decompressed entry exceeds ${Math.round(EXTRACTION_LIMITS.maxEntrySize / 1024 / 1024)}MB limit`,
          'ENTRY_TOO_LARGE'
        );
      }
      if (totalWritten > EXTRACTION_LIMITS.maxUncompressedTotal) {
        throw new ArchiveError(
          'Total decompressed size exceeds archive bomb limit',
          'ARCHIVE_BOMB'
        );
      }
      if (final) {
        fileInfo.writtenBytes = written;
        mkdirSync(join(outPath, '..'), { recursive: true });
        writeFileSync(outPath, Buffer.concat(chunks));
      }
    };
    file.start();
  });
  zip.register(UnzipInflate);

  // Feed the zip bytes
  const buf = readFileSync(zipPath);
  try {
    zip.push(buf, true);
  } catch (err) {
    const error = err as Error;
    // Malformed archive — clean up and rethrow
    cleanupExtractedFiles(manifest);
    if (error instanceof ArchiveError) throw error;
    throw new ArchiveError(`Malformed ZIP archive: ${error.message}`, 'MALFORMED_ARCHIVE');
  }

  manifest.status = 'completed';

  // Post-extraction sanity checks
  if (manifest.inventory.totalFiles === 0) {
    cleanupExtractedFiles(manifest);
    throw new ArchiveError(
      'Archive contains no files (empty archive)',
      'EMPTY_ARCHIVE_CONTENTS'
    );
  }
  if (manifest.inventory.knownFiles === 0 && manifest.inventory.optionalFiles === 0) {
    manifest.warnings.push('No recognized LinkedIn export files found in archive');
  }

  manifest.endTime = new Date();
  return manifest;
}

function truncate(s: string, n = 80): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/** Parse classified files. Skipped/optional files not parsed. */
export function parseExtractedFiles(manifest: IngestionManifest): void {
  for (const file of manifest.inventory.files) {
    if (!file.isSupported || !file.extractedPath) continue;
    const adapter = matchAdapter(file.filename);
    if (!adapter) continue;
    try {
      const result = adapter.parse(file.extractedPath);
      manifest.parseResults.set(file.originalPath, result);
    } catch (err) {
      const error = err as Error;
      manifest.parseResults.set(file.originalPath, {
        records: [],
        columns: [],
        delimiter: ',',
        warnings: [],
        errors: [`Parse error: ${error.message}`],
      });
    }
  }
  manifest.status = 'parsing';
}

export function cleanupExtractedFiles(manifest: IngestionManifest): void {
  if (existsSync(manifest.extractPath)) {
    rmSync(manifest.extractPath, { recursive: true, force: true });
  }
  // also remove import-id temp root
  const root = join(manifest.extractPath, '..', '..');
  if (existsSync(root) && root.includes(`import-${manifest.importId}`)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
}
