import { describe, it, expect } from 'vitest';
import {
  clean,
  cleanOptional,
  companyKey,
  comparisonKey,
  fullName,
  normalizeCompanyName,
  normalizeEmail,
  normalizeLocation,
  normalizePhone,
  normalizeProfileUrl,
  normalizeTitle,
  parseDate,
  profileSlug,
  toDateOnly,
} from '../../../packages/ingestion/src/text';

describe('clean', () => {
  it('collapses whitespace and strips control characters', () => {
    expect(clean('  Jane\u0000  \n Smith ')).toBe('Jane Smith');
  });
  it('is total for nullish input', () => {
    expect(clean(undefined)).toBe('');
    expect(clean(null)).toBe('');
  });
  it('strips zero-width characters LinkedIn sometimes emits', () => {
    expect(clean('Acme​Corp')).toBe('AcmeCorp');
  });
});

describe('cleanOptional', () => {
  it('treats placeholder values as absent', () => {
    for (const v of ['', '  ', 'N/A', 'null', '-']) expect(cleanOptional(v)).toBeUndefined();
  });
});

describe('normalizeProfileUrl', () => {
  it('canonicalises the many shapes LinkedIn exports', () => {
    const expected = 'https://www.linkedin.com/in/janesmith';
    for (const input of [
      'https://www.linkedin.com/in/janesmith',
      'http://linkedin.com/in/JaneSmith/',
      'www.linkedin.com/in/janesmith?trk=contacts',
      'https://uk.linkedin.com/in/janesmith',
      'linkedin.com/pub/janesmith',
    ]) {
      expect(normalizeProfileUrl(input)).toBe(expected);
    }
  });
  it('rejects non-LinkedIn and malformed URLs', () => {
    expect(normalizeProfileUrl('https://example.com/in/jane')).toBeUndefined();
    expect(normalizeProfileUrl('https://www.linkedin.com/company/acme')).toBeUndefined();
    expect(normalizeProfileUrl('not a url')).toBeUndefined();
    expect(normalizeProfileUrl('')).toBeUndefined();
  });
  it('exposes the slug used as identity', () => {
    expect(profileSlug('https://www.linkedin.com/in/janesmith?x=1')).toBe('janesmith');
  });
});

describe('normalizeEmail', () => {
  it('lowercases valid addresses and rejects junk', () => {
    expect(normalizeEmail(' Jane.Smith@Example.COM ')).toBe('jane.smith@example.com');
    expect(normalizeEmail('nope')).toBeUndefined();
    expect(normalizeEmail('a@b')).toBeUndefined();
  });
});

describe('normalizePhone', () => {
  it('keeps digits and a leading plus', () => {
    expect(normalizePhone('+1 (415) 555-0101')).toBe('+14155550101');
    expect(normalizePhone('12')).toBeUndefined();
  });
});

describe('companyKey', () => {
  it('treats legal suffixes and punctuation as noise', () => {
    expect(companyKey('Acme Corp')).toBe('acme');
    expect(companyKey('Acme, Inc.')).toBe('acme');
    expect(companyKey('ACME')).toBe('acme');
    expect(companyKey('Acme Corporation')).toBe('acme');
  });
  it('does not strip a suffix that is the whole name', () => {
    expect(companyKey('Group')).toBe('group');
  });
  it('drops trailing parentheticals', () => {
    expect(normalizeCompanyName('Acme (formerly Widgets)')).toBe('Acme');
  });
  it('is empty for absent input', () => {
    expect(companyKey(undefined)).toBe('');
  });
});

describe('parseDate', () => {
  const cases: [string, string][] = [
    ['2024-03-05', '2024-03-05'],
    ['2024-03-05 14:22:01 UTC', '2024-03-05'],
    ['05 Mar 2024', '2024-03-05'],
    ['5 March 2024', '2024-03-05'],
    ['Mar 5, 2024', '2024-03-05'],
    ['Mar 2024', '2024-03-01'],
    ['2024', '2024-01-01'],
    ['3/5/2024', '2024-03-05'],
    ['25/12/2024', '2024-12-25'],
  ];
  it.each(cases)('parses %s', (input, expected) => {
    expect(toDateOnly(parseDate(input))).toBe(expected);
  });

  it('returns null rather than a bogus date', () => {
    for (const v of ['', '   ', 'sometime', 'Febtember 2024', '2024-02-31']) {
      expect(parseDate(v)).toBeNull();
    }
  });
});

describe('misc normalisers', () => {
  it('normalises names, titles and locations', () => {
    expect(fullName(' Jane ', ' Smith, ')).toBe('Jane Smith');
    expect(normalizeTitle('Senior Engineer -')).toBe('Senior Engineer');
    expect(normalizeLocation(' San Francisco ,  CA ')).toBe('San Francisco, CA');
  });
  it('produces accent-insensitive comparison keys', () => {
    expect(comparisonKey('Íñigo Montoya')).toBe('inigo montoya');
  });
});
