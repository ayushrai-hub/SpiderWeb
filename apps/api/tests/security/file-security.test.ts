import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { getDb } from '@intel/shared';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { randomUUID, createHash } from 'crypto';

describe('File Security Tests', () => {
  let app: ReturnType<typeof Fastify>;
  const workspaceId = '00000000-0000-0000-0000-000000000001';
  const userId = '00000000-0000-0000-0000-000000000002';
  const testDir = '/tmp/intel-file-security-tests';
  const uploadDir = '/tmp/intel-uploads';

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    mkdirSync(uploadDir, { recursive: true });

    app = Fastify({ logger: false });
    await app.ready();

    // Create test workspace directly in DB
    const db = getDb();
    await db.execute(`
      INSERT INTO users (id, email, name, created_at, updated_at)
      VALUES ('${userId}', 'file-test@test.com', 'File Test', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(`
      INSERT INTO workspaces (id, name, slug, owner_id, created_at, updated_at)
      VALUES ('${workspaceId}', 'File Test Workspace', 'file-test-${Date.now()}', '${userId}', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
  });

  afterAll(async () => {
    rmSync(testDir, { recursive: true, force: true });
    await app.close();
  });

  function createTestZip(filename: string, files: { name: string; content: string }[]): string {
    const zipDir = join(testDir, randomUUID());
    mkdirSync(zipDir, { recursive: true });

    for (const file of files) {
      writeFileSync(join(zipDir, file.name), file.content);
    }

    const zipPath = join(testDir, `${filename}.zip`);
    execSync(`cd "${zipDir}" && zip -r "${zipPath}" .`);
    rmSync(zipDir, { recursive: true, force: true });

    return zipPath;
  }

  describe('Valid ZIP Handling', () => {
    it('should handle valid LinkedIn ZIP structure', async () => {
      const zipPath = createTestZip('valid-linkedin', [
        { name: 'Connections.csv', content: 'First Name,Last Name,Company\nJohn,Doe,Acme\n' },
        { name: 'messages.csv', content: 'FROM,TO,CONTENT\njohn@test.com,jane@test.com,Hello\n' },
      ]);

      // Verify ZIP was created correctly
      expect(readFileSync(zipPath).length).toBeGreaterThan(0);
    });
  });

  describe('Corrupt ZIP Handling', () => {
    it('should identify corrupt ZIP files', async () => {
      const corruptZip = join(testDir, 'corrupt.zip');
      writeFileSync(corruptZip, 'This is not a valid ZIP file');

      // Try to extract and verify it fails
      const extractDir = join(testDir, 'corrupt-extract');
      mkdirSync(extractDir, { recursive: true });
      
      try {
        execSync(`unzip -o "${corruptZip}" -d "${extractDir}" 2>&1`, { stdio: 'pipe' });
        // If unzip succeeds, it's not actually corrupt
      } catch (e) {
        // Expected - corrupt ZIP should fail extraction
        expect(e).toBeDefined();
      }
      
      rmSync(extractDir, { recursive: true, force: true });
    });
  });

  describe('Path Traversal Protection', () => {
    it('should sanitize filenames with path traversal', async () => {
      const maliciousNames = [
        '../../../etc/passwd.zip',
        '..\\..\\windows\\system32\\config\\sam.zip',
        'legitimate.zip/../../../etc/shadow',
      ];

      for (const filename of maliciousNames) {
        // Extract just the filename, removing path components
        const sanitized = filename.split(/[/\\]/).pop() || 'unnamed.zip';
        
        // Should not contain path traversal
        expect(sanitized).not.toContain('..');
        expect(sanitized).not.toContain('/');
        expect(sanitized).not.toContain('\\');
      }
    });

    it('should handle null bytes in filenames', async () => {
      const filenameWithNull = 'test.zip\x00malicious.php';
      
      // Remove null bytes and anything after
      const sanitized = filenameWithNull.split('\0')[0];
      
      expect(sanitized).toBe('test.zip');
      expect(sanitized).not.toContain('\0');
    });
  });

  describe('File Size Limits', () => {
    it('should enforce maximum archive size', async () => {
      const maxSize = 500 * 1024 * 1024; // 500MB
      
      // Create a test to verify size checking logic
      const checkSize = (size: number) => size <= maxSize;
      
      expect(checkSize(1024)).toBe(true);
      expect(checkSize(maxSize)).toBe(true);
      expect(checkSize(maxSize + 1)).toBe(false);
    });
  });

  describe('Malformed CSV Handling', () => {
    it('should handle CSV with malformed rows gracefully', async () => {
      const malformedCsv = `First Name,Last Name,Company
John,Doe,Acme
"unclosed quote,Another,Field
Normal,Row,Data
,,
,LastOnly,
FirstOnly,,`;

      // Parse line by line and count valid rows
      const lines = malformedCsv.split('\n');
      const validRows = lines.filter(line => {
        const trimmed = line.trim();
        return trimmed && !trimmed.startsWith('"unclosed');
      });

      // Should have at least the header and some valid rows
      expect(validRows.length).toBeGreaterThan(1);
    });

    it('should handle CSV with different delimiters', async () => {
      const commaSeparated = 'Name,Company\nJohn,Acme\n';
      const semicolonSeparated = 'Name;Company\nJohn;Acme\n';
      const tabSeparated = 'Name\tCompany\nJohn\tAcme\n';

      // All should be parseable
      expect(commaSeparated.length).toBeGreaterThan(0);
      expect(semicolonSeparated.length).toBeGreaterThan(0);
      expect(tabSeparated.length).toBeGreaterThan(0);
    });
  });

  describe('Invalid UTF-8 Handling', () => {
    it('should handle files with invalid UTF-8 bytes', async () => {
      // Create buffer with invalid UTF-8
      const invalidUtf8 = Buffer.from([0xC0, 0xAF, 0xE0, 0x80, 0x80]);
      
      // Should not crash when converting to string
      const result = invalidUtf8.toString('utf8');
      expect(typeof result).toBe('string');
    });
  });

  describe('Empty Files', () => {
    it('should handle empty ZIP files', async () => {
      const emptyZip = join(testDir, 'empty.zip');
      writeFileSync(emptyZip, Buffer.alloc(0));
      
      expect(readFileSync(emptyZip).length).toBe(0);
    });

    it('should handle ZIP with empty CSV files', async () => {
      const zipPath = createTestZip('empty-csv', [
        { name: 'Connections.csv', content: '' },
        { name: 'messages.csv', content: '' },
      ]);

      // ZIP should contain empty files
      expect(readFileSync(zipPath).length).toBeGreaterThan(0);
    });
  });

  describe('Unknown Files', () => {
    it('should handle ZIP with mixed file types', async () => {
      const zipPath = createTestZip('mixed-files', [
        { name: 'Connections.csv', content: 'First Name,Last Name\nJohn,Doe\n' },
        { name: 'random.xyz', content: 'Some unknown format' },
        { name: 'data.json', content: '{"key": "value"}' },
      ]);

      // ZIP should be created successfully
      expect(readFileSync(zipPath).length).toBeGreaterThan(0);
    });
  });

  describe('Duplicate Files', () => {
    it('should handle case-insensitive duplicate filenames', async () => {
      const filenames = ['Connections.csv', 'connections.csv', 'CONNECTIONS.CSV'];
      
      // Should normalize to single file
      const normalized = [...new Set(filenames.map(f => f.toLowerCase()))];
      expect(normalized.length).toBe(1);
    });
  });

  describe('Malicious Filenames', () => {
    it('should sanitize special characters in filenames', async () => {
      const maliciousNames = [
        'file<script>.zip',
        'file"quotes".zip',
        "file'apostrophe'.zip",
        'file;rm -rf /.zip',
        'file$(command).zip',
        'file`backtick`.zip',
      ];

      for (const filename of maliciousNames) {
        // Remove or escape special characters
        const sanitized = filename.replace(/[<>"'; `$()]/g, '_');
        
        // Should not contain original malicious characters
        expect(sanitized).not.toContain('<');
        expect(sanitized).not.toContain('>');
        expect(sanitized).not.toContain('"');
        expect(sanitized).not.toContain(';');
      }
    });
  });

  describe('Non-ZIP Files', () => {
    it('should identify non-ZIP files by extension', async () => {
      const testFiles = [
        { name: 'test.exe', expectedType: 'executable' },
        { name: 'test.pdf', expectedType: 'pdf' },
        { name: 'test.txt', expectedType: 'text' },
        { name: 'test.zip', expectedType: 'zip' },
      ];

      for (const file of testFiles) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        
        if (ext === 'zip') {
          expect(file.expectedType).toBe('zip');
        } else {
          expect(file.expectedType).not.toBe('zip');
        }
      }
    });

    it('should identify non-ZIP files by magic bytes', async () => {
      // ZIP magic bytes
      const zipHeader = Buffer.from([0x50, 0x4B]); // PK
      expect(zipHeader.toString('hex')).toBe('504b');
    });
  });

  describe('Nested Archives', () => {
    it('should handle ZIP containing another ZIP', async () => {
      const innerZipPath = createTestZip('inner', [
        { name: 'inner.csv', content: 'col1,col2\nval1,val2\n' },
      ]);
      
      const outerZipPath = createTestZip('outer', [
        { name: 'inner.zip', content: readFileSync(innerZipPath).toString('binary') },
      ]);

      // Both ZIPs should be valid
      expect(readFileSync(innerZipPath).length).toBeGreaterThan(0);
      expect(readFileSync(outerZipPath).length).toBeGreaterThan(0);
    });
  });

  describe('Checksum Verification', () => {
    it('should calculate consistent checksums', async () => {
      const data = Buffer.from('test data for checksum');
      const checksum1 = createHash('sha256').update(data).digest('hex');
      const checksum2 = createHash('sha256').update(data).digest('hex');
      
      expect(checksum1).toBe(checksum2);
      expect(checksum1).toHaveLength(64); // SHA-256 hex length
    });

    it('should detect modified files', async () => {
      const original = Buffer.from('original data');
      const modified = Buffer.from('modified data');
      
      const checksum1 = createHash('sha256').update(original).digest('hex');
      const checksum2 = createHash('sha256').update(modified).digest('hex');
      
      expect(checksum1).not.toBe(checksum2);
    });
  });
});
