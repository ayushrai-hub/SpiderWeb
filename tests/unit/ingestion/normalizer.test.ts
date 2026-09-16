import { describe, it, expect } from 'vitest';
import { normalizeData, type NormalizedPerson } from '../../../packages/ingestion/src/normalizer';
import type { CsvParseResult } from '../../../packages/ingestion/src/csv-parser';

const WS = 'ws-test-1';

function resultOf(
  filename: string,
  records: Record<string, string>[],
  errors: string[] = []
): Map<string, CsvParseResult> {
  return new Map([
    [
      filename,
      {
        records,
        columns: records[0] ? Object.keys(records[0]) : [],
        delimiter: ',',
        warnings: [],
        errors,
      },
    ],
  ]);
}

describe('normalizeData — Connections', () => {
  it('creates person + connection per record', () => {
    const result = normalizeData(
      resultOf('Connections.csv', [
        { 'First Name': 'Jane', 'Last Name': 'Smith', 'URL': 'https://linkedin.com/in/jane', 'Company': 'Acme', 'Position': 'CTO', 'Connected On': '2023-01-15' },
      ]),
      WS
    );
    expect(result.persons.length).toBe(1);
    expect(result.connections.length).toBe(1);
    expect(result.connections[0].personName).toBe('Jane Smith');
    expect(result.connections[0].connectedAt).toBeInstanceOf(Date);
  });

  it('dedupes identical profile URLs into one person', () => {
    const row = {
      'First Name': 'Jane',
      'Last Name': 'Smith',
      'URL': 'https://www.linkedin.com/in/janesmith',
      'Company': 'Acme',
    };
    const result = normalizeData(resultOf('Connections.csv', [row, row, row]), WS);
    expect(result.persons.length).toBe(1);
  });

  it('dedupes same email different name casing', () => {
    const result = normalizeData(
      resultOf('Connections.csv', [
        { 'First Name': 'A', 'Last Name': 'B', 'Email Address': 'X@Example.com' },
        { 'First Name': 'A', 'Last Name': 'B', 'Email Address': 'x@example.com' },
      ]),
      WS
    );
    expect(result.persons.length).toBe(1);
  });

  it('does NOT merge same-name different-company people', () => {
    const result = normalizeData(
      resultOf('Connections.csv', [
        { 'First Name': 'John', 'Last Name': 'Lee', 'Company': 'Acme' },
        { 'First Name': 'John', 'Last Name': 'Lee', 'Company': 'Globex' },
      ]),
      WS
    );
    expect(result.persons.length).toBe(2);
  });

  it('keeps connection rows aligned with person names', () => {
    const result = normalizeData(
      resultOf('Connections.csv', [
        { 'First Name': 'A', 'Last Name': 'One', 'URL': 'u1' },
        { 'First Name': 'B', 'Last Name': 'Two', 'URL': 'u2' },
      ]),
      WS
    );
    expect(result.connections.map((c) => c.personName).sort()).toEqual(['A One', 'B Two']);
  });
});

describe('normalizeData — Messages', () => {
  it('parses real LinkedIn messages.csv columns (FROM/TO/DATE/CONTENT)', () => {
    const result = normalizeData(
      resultOf('messages.csv', [
        { FROM: 'Jane Smith', TO: 'You', DATE: '2023-05-01 10:00', CONTENT: 'Hi there!' },
      ]),
      WS
    );
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].content).toBe('Hi there!');
    expect(result.messages[0].senderName).toBe('Jane Smith');
    expect(result.messages[0].direction).toBe('inbound');
  });

  it('skips blank message bodies', () => {
    const result = normalizeData(
      resultOf('messages.csv', [
        { FROM: 'A', TO: 'B', DATE: '2023-05-01', CONTENT: '' },
        { FROM: 'A', TO: 'B', DATE: '2023-05-01', CONTENT: 'real' },
      ]),
      WS
    );
    expect(result.messages.length).toBe(1);
  });
});

describe('normalizeData — Positions', () => {
  it('creates employment rows and companies', () => {
    const result = normalizeData(
      resultOf('Positions.csv', [
        { Company: 'Acme Corp', Title: 'Engineer', 'Started On': '2020 Jan', Description: 'Built things' },
        { Company: 'Acme Corp', Title: 'Senior Engineer', 'Started On': '2022 Feb' },
      ]),
      WS
    );
    expect(result.employment.length).toBe(2);
    expect(result.employment[0].isCurrent).toBe(true);
    expect(result.companies.length).toBe(1); // deduped by name
  });
});

describe('normalizeData — Education & Skills', () => {
  it('normalizes education rows', () => {
    const result = normalizeData(
      resultOf('Education.csv', [
        { 'School Name': 'MIT', 'Degree Name': 'BS', 'Field of Study': 'CS' },
      ]),
      WS
    );
    expect(result.education.length).toBe(1);
    expect(result.education[0].school).toBe('MIT');
  });

  it('normalizes skills with endorsements', () => {
    const result = normalizeData(
      resultOf('Skills.csv', [{ Skill: 'TypeScript', Endorsements: '12' }]),
      WS
    );
    expect(result.skills.length).toBe(1);
    expect(result.skills[0].endorsements).toBe(12);
  });
});

describe('normalizeData — malformed input', () => {
  it('collects parse errors without throwing', () => {
    const result = normalizeData(
      resultOf('Connections.csv', [], ['CSV parse error: bad quoting']),
      WS
    );
    expect(result.errors.length).toBe(1);
  });

  it('ignores rows missing names', () => {
    const result = normalizeData(
      resultOf('Connections.csv', [
        { 'First Name': '', 'Last Name': '', 'Company': 'Acme' },
        { 'First Name': 'Ok', 'Last Name': 'Person' },
      ]),
      WS
    );
    expect(result.persons.length).toBe(1);
  });
});
