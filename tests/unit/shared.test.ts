import { describe, it, expect } from 'vitest';
import { parseLinkedInDate, normalizeName, slugify } from '../../packages/shared/src/utils';

describe('parseLinkedInDate', () => {
  it('parses ISO format dates', () => {
    const result = parseLinkedInDate('2024-01-15');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2024);
    expect(result!.getMonth()).toBe(0);
    expect(result!.getDate()).toBe(15);
  });

  it('parses "1 Jan 2023" format', () => {
    const result = parseLinkedInDate('1 Jan 2023');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2023);
    expect(result!.getMonth()).toBe(0);
    expect(result!.getDate()).toBe(1);
  });

  it('parses "Jan 2023" format', () => {
    const result = parseLinkedInDate('Jan 2023');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2023);
    expect(result!.getMonth()).toBe(0);
  });

  it('parses just year', () => {
    const result = parseLinkedInDate('2023');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2023);
  });

  it('returns null for empty string', () => {
    expect(parseLinkedInDate('')).toBeNull();
  });

  it('returns null for invalid input', () => {
    expect(parseLinkedInDate('not a date')).toBeNull();
  });
});

describe('normalizeName', () => {
  it('lowercases and trims', () => {
    expect(normalizeName('  Jane Smith  ')).toBe('jane smith');
  });

  it('removes special characters', () => {
    expect(normalizeName('Jane-Smith Jr.')).toBe('jane smith jr');
  });

  it('collapses whitespace', () => {
    expect(normalizeName('Jane   Smith')).toBe('jane smith');
  });
});

describe('slugify', () => {
  it('creates URL-safe slug', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('handles special characters', () => {
    expect(slugify('Test & Demo!')).toBe('test-demo');
  });

  it('removes leading/trailing hyphens', () => {
    expect(slugify('--test--')).toBe('test');
  });
});
