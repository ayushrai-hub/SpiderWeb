import { basename, join, resolve, sep } from 'node:path';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { Unzip, UnzipInflate } from 'fflate';

export class ArchiveError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'ArchiveError';
    this.code = code;
  }
}

/** Guards against zip bombs, zip-slip and pathological archives. */
export const EXTRACTION_LIMITS = {
  /** Total decompressed bytes across all entries. */
  maxTotalBytes: 1_500 * 1024 * 1024,
  /** Decompressed bytes for a single entry. */
  maxEntryBytes: 256 * 1024 * 1024,
  maxEntries: 5_000,
  maxDepth: 12,
  maxPathLength: 400,
} as const;

const ZIP_MAGIC = 0x04034b50; // "PK\x03\x04"

export interface ExtractedEntry {
  /** Path as recorded inside the archive, normalised to forward slashes. */
  archivePath: string;
  /** Basename, used for dataset detection. */
  filename: string;
  extension: string;
  /** Absolute path on disk. */
  path: string;
  bytes: number;
}

export interface ExtractionResult {
  extractDir: string;
  entries: ExtractedEntry[];
  /** Entries rejected before extraction, with the reason. */
  rejected: { archivePath: string; reason: string }[];
  totalBytes: number;
}

export function isZipFile(path: string): boolean {
  try {
    const buf = Buffer.alloc(4);
    const fd = openSync(path, 'r');
    try {
      readSync(fd, buf, 0, 4, 0);
    } finally {
      closeSync(fd);
    }
    return buf.length >= 4 && buf.readUInt32LE(0) === ZIP_MAGIC;
  } catch {
    return false;
  }
}

/**
 * Extract a LinkedIn archive to `extractDir`.
 *
 * Security properties, all enforced before a single byte is written:
 *   - the file must start with the ZIP magic bytes (extension is not trusted)
 *   - absolute paths, drive letters and `..` segments are rejected
 *   - the resolved output path must stay inside `extractDir`
 *   - per-entry, total-size, entry-count, depth and path-length caps apply
 *   - nested archives are never recursed into
 *   - nothing is ever executed; entries are written as inert files
 */
export function extractArchive(archivePath: string, extractDir: string): ExtractionResult {
  if (!existsSync(archivePath)) {
    throw new ArchiveError('Archive not found on disk.', 'ARCHIVE_NOT_FOUND');
  }
  const { size } = statSync(archivePath);
  if (size === 0) {
    throw new ArchiveError('The uploaded archive is empty (0 bytes).', 'EMPTY_ARCHIVE');
  }
  if (!isZipFile(archivePath)) {
    throw new ArchiveError(
      'That file is not a ZIP archive. Upload the .zip LinkedIn emailed you, or the individual CSV files.',
      'INVALID_ARCHIVE'
    );
  }

  const root = resolve(extractDir);
  mkdirSync(root, { recursive: true });

  const entries: ExtractedEntry[] = [];
  const rejected: { archivePath: string; reason: string }[] = [];
  let totalBytes = 0;
  let fatal: ArchiveError | null = null;

  const unzip = new Unzip((file) => {
    if (fatal) return;
    const rel = String(file.name ?? '').replace(/\\/g, '/');
    if (!rel || rel.endsWith('/')) return; // directory entry

    const reason = rejectionReason(rel, root);
    if (reason) {
      rejected.push({ archivePath: truncate(rel), reason });
      return;
    }
    if (entries.length >= EXTRACTION_LIMITS.maxEntries) {
      rejected.push({
        archivePath: truncate(rel),
        reason: `Archive exceeds ${EXTRACTION_LIMITS.maxEntries} entries`,
      });
      return;
    }
    const declared = file.originalSize ?? 0;
    if (declared > EXTRACTION_LIMITS.maxEntryBytes) {
      rejected.push({
        archivePath: truncate(rel),
        reason: `Entry exceeds ${mb(EXTRACTION_LIMITS.maxEntryBytes)}MB`,
      });
      return;
    }

    const name = basename(rel);
    const outPath = resolve(root, rel.split('/').filter(Boolean).join(sep));

    const chunks: Uint8Array[] = [];
    let written = 0;
    file.ondata = (err, data, final) => {
      if (fatal) return;
      if (err) {
        rejected.push({ archivePath: truncate(rel), reason: `Could not decompress: ${err.message}` });
        return;
      }
      if (data && data.length) {
        written += data.length;
        totalBytes += data.length;
        if (written > EXTRACTION_LIMITS.maxEntryBytes) {
          fatal = new ArchiveError(
            `An entry decompressed to more than ${mb(EXTRACTION_LIMITS.maxEntryBytes)}MB.`,
            'ENTRY_TOO_LARGE'
          );
          return;
        }
        if (totalBytes > EXTRACTION_LIMITS.maxTotalBytes) {
          fatal = new ArchiveError(
            `The archive decompresses to more than ${mb(EXTRACTION_LIMITS.maxTotalBytes)}MB.`,
            'ARCHIVE_BOMB'
          );
          return;
        }
        chunks.push(data);
      }
      if (final) {
        try {
          mkdirSync(join(outPath, '..'), { recursive: true });
          writeFileSync(outPath, Buffer.concat(chunks.map((c) => Buffer.from(c))));
          entries.push({
            archivePath: rel,
            filename: name,
            extension: (name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase(),
            path: outPath,
            bytes: written,
          });
        } catch (writeErr) {
          rejected.push({
            archivePath: truncate(rel),
            reason: `Could not write to disk: ${(writeErr as Error).message}`,
          });
        }
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);

  try {
    unzip.push(readFileSync(archivePath), true);
  } catch (err) {
    cleanupDir(root);
    throw new ArchiveError(
      `The archive is corrupted and could not be read (${(err as Error).message}).`,
      'MALFORMED_ARCHIVE'
    );
  }

  if (fatal) {
    cleanupDir(root);
    throw fatal;
  }

  if (entries.length === 0) {
    cleanupDir(root);
    throw new ArchiveError('The archive contains no readable files.', 'EMPTY_ARCHIVE_CONTENTS');
  }

  return { extractDir: root, entries, rejected, totalBytes };
}

function rejectionReason(rel: string, root: string): string | null {
  if (rel.startsWith('/') || /^[a-zA-Z]:/.test(rel)) return 'Absolute paths are not allowed';
  const parts = rel.split('/').filter(Boolean);
  if (parts.some((p) => p === '..')) return 'Path traversal entry rejected';
  if (rel.length > EXTRACTION_LIMITS.maxPathLength) return 'Path is too long';
  if (parts.length > EXTRACTION_LIMITS.maxDepth) return 'Nested too deeply';
  if (rel.includes('__MACOSX/') || basename(rel).startsWith('._') || basename(rel) === '.DS_Store') {
    return 'System file ignored';
  }
  const out = resolve(root, parts.join(sep));
  if (out !== root && !out.startsWith(root + sep)) return 'Entry would escape the extraction directory';
  const ext = (basename(rel).match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
  if (['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'].includes(ext))
    return 'Nested archives are not extracted';
  return null;
}

export function cleanupDir(dir: string): void {
  try {
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best effort: a leftover temp dir is not worth failing an import over.
  }
}

function mb(bytes: number): number {
  return Math.round(bytes / 1024 / 1024);
}

function truncate(value: string, max = 120): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
