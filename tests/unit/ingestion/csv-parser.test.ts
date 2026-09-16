import { describe, it, expect } from 'vitest';
import { parseCsv, detectEncoding } from '../../../packages/ingestion/src/csv-parser';
import { writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'csv-test-'));
});

const CSV = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
Jane,Smith,https://www.linkedin.com/in/janesmith,jane@example.com,Acme Corp,Engineer,2023-01-15
John,Doe,https://www.linkedin.com/in/johndoe,john@example.com,Globex,Designer,2023-02-20
Jane,Smith,https://www.linkedin.com/in/janesmith,jane@example.com,Acme Corp,Engineer,2023-01-15`;

describe('parseCsv', () => {
  it('parses LinkedIn Connections.csv', () => {
    const p = join(dir, 'Connections.csv');
    writeFileSync(p, CSV);
    const r = parseCsv(p);
    expect(r.errors).toEqual([]);
    expect(r.records.length).toBe(3);
    expect(r.records[0]['First Name']).toBe('Jane');
    expect(r.columns).toContain('Connected On');
  });

  it('handles UTF-16LE with BOM (real LinkedIn export encoding)', () => {
    const p = join(dir, 'u16.csv');
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(CSV, 'utf16le')]);
    writeFileSync(p, buf);
    expect(detectEncoding(buf)).toBe('utf16le');
    const r = parseCsv(p);
    expect(r.errors).toEqual([]);
    expect(r.records.length).toBe(3);
    expect(r.records[1]['Last Name']).toBe('Doe');
  });

  it('handles quoted fields with embedded commas and newlines', () => {
    const p = join(dir, 'quoted.csv');
    writeFileSync(p, 'Title,Content\n"Engineer, Senior","line1\nline2"');
    const r = parseCsv(p);
    expect(r.records.length).toBe(1);
    expect(r.records[0]['Title']).toBe('Engineer, Senior');
    expect(r.records[0]['Content']).toContain('line2');
  });

  it('headers-only file returns zero records, zero errors', () => {
    const p = join(dir, 'headers.csv');
    writeFileSync(p, 'Skill\n');
    const r = parseCsv(p);
    expect(r.records.length).toBe(0);
    expect(r.errors.length).toBe(0);
  });

  it('malformed content is captured as error, not thrown', () => {
    const p = join(dir, 'bad.csv');
    writeFileSync(p, Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]));
    const r = parseCsv(p);
    // Should not throw — errors captured
    expect(r).toHaveProperty('errors');
  });

  it('semicolon-delimited files auto-detect', () => {
    const p = join(dir, 'semi.csv');
    writeFileSync(p, 'First Name;Last Name\nJane;Smith');
    const r = parseCsv(p);
    expect(r.delimiter).toBe(';');
    expect(r.records.length).toBe(1);
    expect(r.records[0]['First Name']).toBe('Jane');
  });
});
