import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { clean } from './text.js';

export interface CsvParseResult {
  /** Header cells exactly as they appear in the file. */
  headers: string[];
  /** Lower-cased, punctuation-free header cells, for adapter matching. */
  headerKeys: string[];
  rows: Record<string, string>[];
  delimiter: string;
  encoding: string;
  /** Rows dropped because they were blank or unparseable. */
  skippedRows: number;
  warnings: string[];
  errors: string[];
}

const DELIMITERS = [',', ';', '\t', '|'] as const;
const MAX_WARNINGS = 20;

export function detectEncoding(buffer: Buffer): BufferEncoding {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return 'utf16le';
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return 'utf16le'; // swapped below
  return 'utf8';
}

function decode(buffer: Buffer): { text: string; encoding: string } {
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    // UTF-16 BE: swap byte pairs so Node can decode it as LE.
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return { text: swapped.toString('utf16le'), encoding: 'utf16be' };
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: buffer.subarray(2).toString('utf16le'), encoding: 'utf16le' };
  }
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text, encoding: 'utf8' };
}

/** Pick the delimiter that yields the most consistent column count. */
export function detectDelimiter(sample: string): string {
  const lines = sample
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, 25);
  if (lines.length === 0) return ',';

  let best = ',';
  let bestScore = -1;
  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => countOutsideQuotes(line, delimiter));
    const max = Math.max(...counts);
    if (max === 0) continue;
    // Prefer delimiters that appear the same number of times on most lines.
    const modal = counts.filter((c) => c === max).length;
    const score = max * 10 + modal;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && ch === delimiter) {
      count++;
    }
  }
  return count;
}

/** `First Name` -> `first name`; used so adapters tolerate casing/punctuation drift. */
export function headerKey(value: string): string {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * LinkedIn prefixes some CSVs (notably Connections.csv) with a free-text
 * "Notes:" preamble and a blank line before the real header. Find the first
 * row that actually looks like a header.
 */
function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = rows[i].map((c) => clean(c));
    const filled = cells.filter(Boolean);
    if (filled.length >= 2 && filled.length === cells.length) return i;
  }
  // Single-column files (e.g. Skills.csv) — first non-empty row.
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i].some((c) => clean(c))) return i;
  }
  return -1;
}

export interface ParseOptions {
  delimiter?: string;
  /** Hard cap on retained rows; protects memory on pathological files. */
  maxRows?: number;
}

export function parseCsvBuffer(buffer: Buffer, options: ParseOptions = {}): CsvParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (buffer.length === 0) {
    return {
      headers: [],
      headerKeys: [],
      rows: [],
      delimiter: ',',
      encoding: 'utf8',
      skippedRows: 0,
      warnings,
      errors: ['File is empty'],
    };
  }

  const { text, encoding } = decode(buffer);
  if (!text.trim()) {
    return {
      headers: [],
      headerKeys: [],
      rows: [],
      delimiter: ',',
      encoding,
      skippedRows: 0,
      warnings,
      errors: ['File contains no data'],
    };
  }

  const delimiter = options.delimiter ?? detectDelimiter(text);

  let raw: string[][];
  try {
    raw = parse(text, {
      delimiter,
      columns: false,
      bom: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_records_with_error: true,
      trim: false,
    }) as string[][];
  } catch (err) {
    return {
      headers: [],
      headerKeys: [],
      rows: [],
      delimiter,
      encoding,
      skippedRows: 0,
      warnings,
      errors: [`Could not read as CSV: ${(err as Error).message}`],
    };
  }

  const headerIndex = findHeaderRow(raw);
  if (headerIndex === -1) {
    return {
      headers: [],
      headerKeys: [],
      rows: [],
      delimiter,
      encoding,
      skippedRows: 0,
      warnings,
      errors: ['No header row found'],
    };
  }
  if (headerIndex > 0) {
    warnings.push(`Skipped ${headerIndex} preamble line(s) before the header`);
  }

  const headers = raw[headerIndex].map((h) => clean(h));
  const headerKeys = headers.map(headerKey);
  const rows: Record<string, string>[] = [];
  let skippedRows = 0;
  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY;

  for (let i = headerIndex + 1; i < raw.length; i++) {
    const cells = raw[i];
    if (!cells || cells.every((c) => clean(c) === '')) {
      skippedRows++;
      continue;
    }
    if (rows.length >= maxRows) {
      warnings.push(`Row limit (${maxRows}) reached; remaining rows were not imported`);
      skippedRows += raw.length - i;
      break;
    }
    if (cells.length > headers.length && warnings.length < MAX_WARNINGS) {
      warnings.push(
        `Row ${i + 1} has ${cells.length} columns but the header has ${headers.length}; extra columns ignored`
      );
    }
    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      record[headerKeys[c]] = clean(cells[c] ?? '');
    }
    rows.push(record);
  }

  if (warnings.length >= MAX_WARNINGS) {
    warnings.splice(MAX_WARNINGS, warnings.length, `… and further row warnings were suppressed`);
  }

  return { headers, headerKeys, rows, delimiter, encoding, skippedRows, warnings, errors };
}

export function parseCsvFile(filePath: string, options: ParseOptions = {}): CsvParseResult {
  try {
    return parseCsvBuffer(readFileSync(filePath), options);
  } catch (err) {
    return {
      headers: [],
      headerKeys: [],
      rows: [],
      delimiter: ',',
      encoding: 'utf8',
      skippedRows: 0,
      warnings: [],
      errors: [`Could not read file: ${(err as Error).message}`],
    };
  }
}
