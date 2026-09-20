import { describe, it, expect } from 'vitest';
import { parseCsvBuffer, detectDelimiter, headerKey } from '../../../packages/ingestion/src/csv-parser';
import { CONNECTIONS_V1, MALFORMED_CONNECTIONS_CSV, connectionsCsv } from '../../fixtures/linkedin-export';

const buf = (s: string) => Buffer.from(s, 'utf8');

describe('parseCsvBuffer', () => {
  it('skips the free-text preamble LinkedIn puts above Connections.csv', () => {
    const r = parseCsvBuffer(buf(connectionsCsv(CONNECTIONS_V1)));
    expect(r.errors).toEqual([]);
    expect(r.headers).toEqual([
      'First Name',
      'Last Name',
      'URL',
      'Email Address',
      'Company',
      'Position',
      'Connected On',
    ]);
    expect(r.rows).toHaveLength(CONNECTIONS_V1.length);
    expect(r.warnings.join(' ')).toMatch(/preamble/);
  });

  it('exposes rows keyed by normalised header', () => {
    const r = parseCsvBuffer(buf(connectionsCsv(CONNECTIONS_V1)));
    expect(r.rows[0]['first name']).toBe('Jane');
    expect(r.rows[0]['connected on']).toBe('01 Jan 2023');
  });

  it('keeps going when individual rows are malformed', () => {
    const r = parseCsvBuffer(buf(MALFORMED_CONNECTIONS_CSV));
    const names = r.rows.map((row) => row['first name']);
    expect(names).toContain('Valid');
    expect(names).toContain('Last');
    // The all-blank row is dropped rather than imported as an empty person.
    expect(names).not.toContain('');
    expect(r.skippedRows).toBeGreaterThan(0);
  });

  it('handles quoted commas, newlines and doubled quotes', () => {
    const csv = 'A,B\n"x, y","he said ""hi""\nsecond line"\n';
    const r = parseCsvBuffer(buf(csv));
    expect(r.rows[0].a).toBe('x, y');
    expect(r.rows[0].b).toBe('he said "hi" second line');
  });

  it('reads UTF-16LE with BOM', () => {
    const csv = 'First Name,Last Name\nJane,Smith\n';
    const b = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(csv, 'utf16le')]);
    const r = parseCsvBuffer(b);
    expect(r.encoding).toBe('utf16le');
    expect(r.rows[0]['first name']).toBe('Jane');
  });

  it('reads UTF-16BE with BOM', () => {
    const le = Buffer.from('First Name,Last Name\nJane,Smith\n', 'utf16le');
    const be = Buffer.from(le);
    be.swap16();
    const r = parseCsvBuffer(Buffer.concat([Buffer.from([0xfe, 0xff]), be]));
    expect(r.encoding).toBe('utf16be');
    expect(r.rows[0]['last name']).toBe('Smith');
  });

  it('strips a UTF-8 BOM', () => {
    const r = parseCsvBuffer(buf('﻿First Name,Last Name\nJane,Smith\n'));
    expect(r.headers[0]).toBe('First Name');
  });

  it('reports empty files instead of throwing', () => {
    expect(parseCsvBuffer(Buffer.alloc(0)).errors[0]).toMatch(/empty/i);
    expect(parseCsvBuffer(buf('   \n\n')).errors[0]).toMatch(/no data/i);
  });

  it('handles a single-column file such as Skills.csv', () => {
    const r = parseCsvBuffer(buf('Name\nGo\nPostgreSQL\n'));
    expect(r.headers).toEqual(['Name']);
    expect(r.rows.map((x) => x.name)).toEqual(['Go', 'PostgreSQL']);
  });

  it('enforces the row cap and says so', () => {
    const csv = 'Name\n' + Array.from({ length: 50 }, (_, i) => `n${i}`).join('\n');
    const r = parseCsvBuffer(buf(csv), { maxRows: 10 });
    expect(r.rows).toHaveLength(10);
    expect(r.warnings.join(' ')).toMatch(/Row limit/);
  });

  it('detects semicolon and tab delimiters', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
  });

  it('does not count delimiters inside quotes', () => {
    expect(detectDelimiter('"a,b";c\n"1,2";3')).toBe(';');
  });
});

describe('headerKey', () => {
  it('normalises casing and punctuation', () => {
    expect(headerKey('  Connected On ')).toBe('connected on');
    expect(headerKey('inviterProfileUrl')).toBe('inviterprofileurl');
    expect(headerKey('Email Address')).toBe('email address');
  });
});
