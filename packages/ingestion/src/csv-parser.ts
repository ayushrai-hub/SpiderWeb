import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';

export interface CsvParseOptions {
  delimiter?: string;
  header?: boolean;
  skipEmptyLines?: boolean;
  columns?: boolean;
  bom?: boolean;
}

export interface CsvParseResult {
  records: Record<string, string>[];
  columns: string[];
  delimiter: string;
  warnings: string[];
  errors: string[];
}

const COMMON_DELIMITERS = [',', ';', '\t', '|'];

export function detectDelimiter(sample: string): string {
  const lines = sample.split('\n').slice(0, 5);
  const line = lines[0] || '';
  
  let bestDelimiter = ',';
  let bestScore = 0;

  for (const delimiter of COMMON_DELIMITERS) {
    const count = (line.match(new RegExp(delimiter === '|' ? '\\|' : delimiter === '\t' ? '\t' : delimiter === ';' ? ';' : ',', 'g')) || []).length;
    if (count > bestScore) {
      bestScore = count;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

export function detectEncoding(buffer: Buffer): string {
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) return 'utf16le';
  if (buffer[0] === 0xFE && buffer[1] === 0xFF) return 'utf16be';
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) return 'utf8';
  return 'utf8';
}

export function parseCsv(filePath: string, options: CsvParseOptions = {}): CsvParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    const buffer = readFileSync(filePath);
    const encoding = detectEncoding(buffer);
    let content = buffer.toString(encoding as BufferEncoding);
    
    const bom = content.charCodeAt(0) === 0xFEFF;
    if (bom) content = content.slice(1);

    const delimiter = options.delimiter || detectDelimiter(content);
    
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      delimiter,
      relax_column_count: true,
      relax_quotes: true,
      ...options,
    });

    const columns = records.length > 0 ? Object.keys(records[0]) : [];

    return {
      records,
      columns,
      delimiter,
      warnings,
      errors,
    };
  } catch (err) {
    const error = err as Error;
    errors.push(`CSV parse error: ${error.message}`);
    return {
      records: [],
      columns: [],
      delimiter: ',',
      warnings,
      errors,
    };
  }
}
