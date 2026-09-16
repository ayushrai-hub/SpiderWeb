import { join, basename } from 'path';
import { mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { matchAdapter } from './linkedin/adapters.js';
import type { CsvParseResult } from './csv-parser.js';

export interface ArchiveInventory {
  files: ArchiveFile[];
  totalFiles: number;
  knownFiles: number;
  unknownFiles: number;
  emptyFiles: number;
  errors: string[];
}

export interface ArchiveFile {
  filename: string;
  fileType: string;
  size: number;
  isRequired: boolean;
  isKnown: boolean;
  isEmpty: boolean;
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
  status: 'pending' | 'extracting' | 'parsing' | 'normalizing' | 'completed' | 'failed';
  warnings: string[];
  errors: string[];
}

function extractZipSimple(zipPath: string, destPath: string): string[] {
  mkdirSync(destPath, { recursive: true });

  execSync(`unzip -o "${zipPath}" -d "${destPath}" 2>&1`, { encoding: 'utf-8' });

  const files: string[] = [];

  function walkDir(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  walkDir(destPath);
  return files;
}

function inventoryFiles(files: string[]): ArchiveInventory {
  const archiveFiles: ArchiveFile[] = [];
  let knownCount = 0;
  let unknownCount = 0;
  let emptyCount = 0;

  for (const filePath of files) {
    const filename = basename(filePath);
    const adapter = matchAdapter(filename);
    const stats = statSync(filePath);

    const archiveFile: ArchiveFile = {
      filename,
      fileType: adapter ? adapter.fileType : 'Unknown',
      size: stats.size,
      isRequired: adapter?.required || false,
      isKnown: !!adapter,
      isEmpty: stats.size === 0,
    };

    archiveFiles.push(archiveFile);

    if (adapter) knownCount++;
    else unknownCount++;
    if (stats.size === 0) emptyCount++;
  }

  return {
    files: archiveFiles,
    totalFiles: files.length,
    knownFiles: knownCount,
    unknownFiles: unknownCount,
    emptyFiles: emptyCount,
    errors: [],
  };
}

function parseFiles(
  files: string[]
): Map<string, CsvParseResult> {
  const results = new Map<string, CsvParseResult>();

  for (const filePath of files) {
    const filename = basename(filePath);
    const adapter = matchAdapter(filename);

    if (!adapter) continue;

    try {
      const result = adapter.parse(filePath);
      results.set(filename, result);
    } catch (err) {
      const error = err as Error;
      results.set(filename, {
        records: [],
        columns: [],
        delimiter: ',',
        warnings: [],
        errors: [`Parse error: ${error.message}`],
      });
    }
  }

  return results;
}

export function extractArchive(
  zipPath: string,
  importId: string,
  tempDir: string = '/tmp'
): IngestionManifest {
  const extractPath = join(tempDir, `import-${importId}`);

  const files = extractZipSimple(zipPath, extractPath);
  const inventory = inventoryFiles(files);
  const parseResults = parseFiles(files);

  const warnings: string[] = [];
  const errors: string[] = [];

  if (inventory.unknownFiles > 0) {
    warnings.push(`${inventory.unknownFiles} unknown files detected and stored as metadata`);
  }
  if (inventory.emptyFiles > 0) {
    warnings.push(`${inventory.emptyFiles} empty files processed`);
  }

  return {
    importId,
    source: 'linkedin',
    archivePath: zipPath,
    extractPath,
    inventory,
    parseResults,
    startTime: new Date(),
    status: 'completed',
    warnings,
    errors,
  };
}

export function cleanupExtractedFiles(manifest: IngestionManifest): void {
  if (existsSync(manifest.extractPath)) {
    rmSync(manifest.extractPath, { recursive: true, force: true });
  }
}
