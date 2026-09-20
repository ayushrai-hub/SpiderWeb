import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import {
  ArchiveError,
  EXTRACTION_LIMITS,
  extractArchive,
  isZipFile,
} from '../../../packages/ingestion/src/archive';
import { buildArchive, buildMaliciousArchive } from '../../fixtures/linkedin-export';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spiderweb-archive-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync('/tmp/spiderweb-pwned.txt', { force: true });
});

function write(name: string, bytes: Uint8Array | string): string {
  const p = join(dir, name);
  writeFileSync(p, bytes);
  return p;
}

describe('isZipFile', () => {
  it('checks magic bytes, not the extension', () => {
    expect(isZipFile(write('real.csv', buildArchive()))).toBe(true);
    expect(isZipFile(write('fake.zip', 'First Name,Last Name\n'))).toBe(false);
    expect(isZipFile(join(dir, 'missing.zip'))).toBe(false);
  });
});

describe('extractArchive', () => {
  it('extracts a realistic LinkedIn archive', () => {
    const result = extractArchive(write('export.zip', buildArchive()), join(dir, 'out'));
    const names = result.entries.map((e) => e.filename);
    expect(names).toContain('Connections.csv');
    expect(names).toContain('Positions.csv');
    expect(names).toContain('Job Applications.csv');
    expect(result.totalBytes).toBeGreaterThan(0);
  });

  it('ignores macOS metadata without failing', () => {
    const result = extractArchive(write('export.zip', buildArchive()), join(dir, 'out'));
    expect(result.entries.some((e) => e.archivePath.includes('__MACOSX'))).toBe(false);
    expect(result.entries.some((e) => e.filename === '.DS_Store')).toBe(false);
    expect(result.rejected.some((r) => /System file/.test(r.reason))).toBe(true);
  });

  it('refuses path traversal and absolute entries', () => {
    const result = extractArchive(write('evil.zip', buildMaliciousArchive()), join(dir, 'out'));
    expect(existsSync('/tmp/spiderweb-pwned.txt')).toBe(false);
    expect(result.entries.map((e) => e.filename)).toEqual(['Connections.csv']);
    expect(result.rejected).toHaveLength(2);
    for (const entry of result.entries) {
      expect(entry.path.startsWith(join(dir, 'out'))).toBe(true);
    }
  });

  it('does not recurse into nested archives', () => {
    const inner = zipSync({ 'Connections.csv': strToU8('First Name\nX\n') });
    const outer = zipSync({ 'nested.zip': inner, 'Skills.csv': strToU8('Name\nGo\n') });
    const result = extractArchive(write('outer.zip', outer), join(dir, 'out'));
    expect(result.entries.map((e) => e.filename)).toEqual(['Skills.csv']);
    expect(result.rejected[0].reason).toMatch(/Nested archives/);
  });

  it('rejects a file that is not a ZIP', () => {
    const p = write('notzip.zip', 'First Name,Last Name\nJane,Smith\n');
    expect(() => extractArchive(p, join(dir, 'out'))).toThrow(ArchiveError);
    try {
      extractArchive(p, join(dir, 'out'));
    } catch (err) {
      expect((err as ArchiveError).code).toBe('INVALID_ARCHIVE');
      expect((err as ArchiveError).message).toMatch(/not a ZIP archive/);
    }
  });

  it('rejects an empty file', () => {
    const p = write('empty.zip', new Uint8Array(0));
    expect(() => extractArchive(p, join(dir, 'out'))).toThrow(/empty/i);
  });

  it('rejects a truncated archive', () => {
    const full = buildArchive();
    const p = write('trunc.zip', full.slice(0, Math.floor(full.length / 2)));
    expect(() => extractArchive(p, join(dir, 'out'))).toThrow(ArchiveError);
  });

  it('rejects an archive of only irrelevant entries as empty of content', () => {
    const p = write('junk.zip', zipSync({ '__MACOSX/._x': strToU8('x'), '.DS_Store': strToU8('y') }));
    expect(() => extractArchive(p, join(dir, 'out'))).toThrow(/no readable files/i);
  });

  it('stops a decompression bomb before it fills the disk', () => {
    const big = new Uint8Array(EXTRACTION_LIMITS.maxEntryBytes + 1024); // highly compressible zeroes
    const p = write('bomb.zip', zipSync({ 'big.csv': big }, { level: 9 }));
    expect(() => extractArchive(p, join(dir, 'out'))).toThrow(ArchiveError);
    expect(readdirSync(dir)).not.toContain('out');
  });

  it('cleans up the extraction directory when it throws', () => {
    const p = write(
      'bomb.zip',
      zipSync({ 'big.csv': new Uint8Array(EXTRACTION_LIMITS.maxEntryBytes + 1024) }, { level: 9 })
    );
    const out = join(dir, 'out');
    expect(() => extractArchive(p, out)).toThrow();
    expect(existsSync(out)).toBe(false);
  });
});
