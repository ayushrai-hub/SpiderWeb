import { describe, it, expect } from 'vitest';
import { parseCsvBuffer } from '../../../packages/ingestion/src/csv-parser';
import { detectDataset, matchByHeaders, isIgnoredFilename } from '../../../packages/ingestion/src/datasets';
import { normalizeDatasets, personKeyFor, SELF_KEY } from '../../../packages/ingestion/src/normalize';
import type { ParsedDataset } from '../../../packages/ingestion/src/normalize';
import type { DatasetKey } from '../../../packages/ingestion/src/datasets';
import {
  CONNECTIONS_V1,
  EDUCATION_CSV,
  ENDORSEMENTS_CSV,
  INVITATIONS_CSV,
  MALFORMED_CONNECTIONS_CSV,
  MESSAGES_CSV,
  POSITIONS_CSV,
  PROFILE_CSV,
  SKILLS_CSV,
  JOB_APPLICATIONS_CSV,
  connectionsCsv,
} from '../../fixtures/linkedin-export';

function ds(dataset: DatasetKey, sourceFile: string, content: string): ParsedDataset {
  return { dataset, sourceFile, parse: parseCsvBuffer(Buffer.from(content, 'utf8')) };
}

describe('dataset detection', () => {
  it('matches by filename', () => {
    expect(detectDataset('Connections.csv', [])?.key).toBe('connections');
    expect(detectDataset('Job Applications.csv', [])?.key).toBe('job_applications');
    expect(detectDataset('Endorsement_Received_Info.csv', [])?.key).toBe('endorsements_received');
  });

  it('falls back to the header signature when the file was renamed', () => {
    const headers = [
      'First Name',
      'Last Name',
      'URL',
      'Email Address',
      'Company',
      'Position',
      'Connected On',
    ];
    expect(matchByHeaders(headers)?.key).toBe('connections');
    expect(detectDataset('export (1).csv', headers)?.key).toBe('connections');
  });

  it('returns null for files it does not recognise', () => {
    expect(detectDataset('budget.csv', ['Month', 'Amount'])).toBeNull();
  });

  it('names the datasets it deliberately skips', () => {
    expect(isIgnoredFilename('Ads Clicked.csv')).toMatch(/Advertising/);
    expect(isIgnoredFilename('Login History.csv')).toMatch(/telemetry/);
    expect(isIgnoredFilename('Connections.csv')).toBeNull();
  });
});

describe('personKeyFor', () => {
  it('prefers the profile URL, then email, then name + company', () => {
    expect(
      personKeyFor({ profileUrl: 'https://www.linkedin.com/in/jane', email: 'j@x.com', fullName: 'Jane' })
    ).toBe('url:jane');
    expect(personKeyFor({ email: 'j@x.com', fullName: 'Jane' })).toBe('email:j@x.com');
    expect(personKeyFor({ fullName: 'Jane Smith', company: 'Acme, Inc.' })).toBe('nc:jane smith|acme');
    expect(personKeyFor({ fullName: 'Jane Smith' })).toBe('name:jane smith');
    expect(personKeyFor({ fullName: '   ' })).toBeNull();
  });

  it('gives the same key regardless of URL formatting', () => {
    const a = personKeyFor({ profileUrl: 'https://www.linkedin.com/in/janesmith', fullName: 'Jane Smith' });
    const b = personKeyFor({ profileUrl: 'linkedin.com/in/JaneSmith/?trk=x', fullName: 'Jane Smith' });
    expect(a).toBe(b);
  });
});

describe('normalizeDatasets — connections', () => {
  const result = normalizeDatasets([ds('connections', 'Connections.csv', connectionsCsv(CONNECTIONS_V1))]);

  it('collapses the duplicated export row into one person and one connection', () => {
    expect(CONNECTIONS_V1.filter((c) => c.firstName === 'Jane')).toHaveLength(2);
    expect([...result.people.values()].filter((p) => p.fullName === 'Jane Smith')).toHaveLength(1);
    expect(result.connections.filter((c) => c.personKey === 'url:janesmith')).toHaveLength(1);
  });

  it('keeps current company and title as structured fields, not just a headline', () => {
    const jane = result.people.get('url:janesmith')!;
    expect(jane.currentCompany).toBe('Acme Corp');
    expect(jane.currentTitle).toBe('Senior Engineer');
    expect(jane.headline).toBe('Senior Engineer at Acme Corp');
    expect(jane.email).toBe('jane.smith@example.com');
  });

  it('parses connection dates', () => {
    expect(result.people.get('url:janesmith')!.connectedAt?.toISOString().slice(0, 10)).toBe('2023-01-01');
  });

  it('resolves companies that differ only by legal suffix', () => {
    // "Acme Corp" and "Acme Corporation" are one company.
    expect(result.companies.has('acme')).toBe(true);
    expect([...result.companies.keys()].filter((k) => k.startsWith('acme'))).toEqual(['acme']);
  });

  it('identifies people with neither URL nor email by name and company', () => {
    expect(result.people.has('nc:priya nair|globex')).toBe(true);
  });

  it('creates an employment row per connection so company views work', () => {
    const acme = result.employment.filter((e) => e.companyName?.startsWith('Acme'));
    expect(acme.length).toBeGreaterThanOrEqual(3);
    expect(acme.every((e) => e.isCurrent)).toBe(true);
  });

  it('reports accepted and rejected counts', () => {
    const o = result.outcomes[0];
    expect(o.discovered).toBe(CONNECTIONS_V1.length);
    expect(o.accepted).toBe(CONNECTIONS_V1.length);
    expect(o.rejected).toBe(0);
  });
});

describe('normalizeDatasets — malformed input', () => {
  it('rejects unusable rows and imports the rest', () => {
    const result = normalizeDatasets([ds('connections', 'Connections.csv', MALFORMED_CONNECTIONS_CSV)]);
    const names = [...result.people.values()].map((p) => p.fullName);
    expect(names).toContain('Valid Person');
    expect(names).toContain('Last Valid');
    expect(result.outcomes[0].errors).toEqual([]);
  });

  it('never produces a person without a name', () => {
    const result = normalizeDatasets([ds('connections', 'Connections.csv', MALFORMED_CONNECTIONS_CSV)]);
    for (const p of result.people.values()) expect(p.fullName.trim()).not.toBe('');
  });
});

describe('normalizeDatasets — the archive owner', () => {
  const result = normalizeDatasets([
    ds('profile', 'Profile.csv', PROFILE_CSV),
    ds('positions', 'Positions.csv', POSITIONS_CSV),
    ds('education', 'Education.csv', EDUCATION_CSV),
    ds('skills', 'Skills.csv', SKILLS_CSV),
  ]);

  it('treats Profile.csv as the account owner', () => {
    expect(result.self?.fullName).toBe('Alex Rivera');
    expect(result.self?.isSelf).toBe(true);
    expect(result.self?.industry).toBe('Software Development');
    expect(result.self?.location).toBe('San Francisco Bay Area');
  });

  it('attaches Positions, Education and Skills to the owner, not to connections', () => {
    expect(result.employment.every((e) => e.personKey === SELF_KEY)).toBe(true);
    expect(result.education.every((e) => e.personKey === SELF_KEY)).toBe(true);
    expect(result.skills.every((s) => s.personKey === SELF_KEY)).toBe(true);
  });

  it('marks only the open-ended position as current', () => {
    const current = result.employment.filter((e) => e.isCurrent);
    expect(current).toHaveLength(1);
    expect(current[0].companyName).toBe('Globex');
    expect(current[0].startedOn).toBe('2023-02-01');
  });

  it('keeps the raw date strings alongside the parsed ones', () => {
    const acme = result.employment.find((e) => e.companyName === 'Acme Corp')!;
    expect(acme.startDate).toBe('Mar 2019');
    expect(acme.endedOn).toBe('2023-01-01');
  });
});

describe('normalizeDatasets — messages', () => {
  const result = normalizeDatasets([
    ds('profile', 'Profile.csv', PROFILE_CSV),
    ds('connections', 'Connections.csv', connectionsCsv(CONNECTIONS_V1)),
    ds('messages', 'messages.csv', MESSAGES_CSV),
  ]);

  it('groups messages by conversation id', () => {
    expect(result.conversations.size).toBe(2);
    expect(result.messages).toHaveLength(3);
  });

  it('derives direction from the folder and the owner identity', () => {
    const byDirection = result.messages.reduce<Record<string, number>>((acc, m) => {
      acc[m.direction] = (acc[m.direction] ?? 0) + 1;
      return acc;
    }, {});
    expect(byDirection).toEqual({ inbound: 2, outbound: 1 });
  });

  it('records the counterpart so a conversation can be linked to a person', () => {
    const c = result.conversations.get('c-1001')!;
    expect(c.counterpartUrl).toBe('https://www.linkedin.com/in/janesmith');
  });

  it('gives each message a stable id so re-import does not duplicate', () => {
    const again = normalizeDatasets([
      ds('profile', 'Profile.csv', PROFILE_CSV),
      ds('messages', 'messages.csv', MESSAGES_CSV),
    ]);
    expect(again.messages.map((m) => m.externalId)).toEqual(result.messages.map((m) => m.externalId));
  });
});

describe('normalizeDatasets — relationship signals', () => {
  const result = normalizeDatasets([
    ds('profile', 'Profile.csv', PROFILE_CSV),
    ds('connections', 'Connections.csv', connectionsCsv(CONNECTIONS_V1)),
    ds('endorsements_received', 'Endorsement_Received_Info.csv', ENDORSEMENTS_CSV),
    ds('invitations', 'Invitations.csv', INVITATIONS_CSV),
  ]);

  it('records endorsements as touchpoints with the endorser', () => {
    const endorsements = result.interactions.filter((i) => i.kind === 'endorsement');
    expect(endorsements).toHaveLength(2);
    expect(endorsements.map((e) => e.personKey).sort()).toEqual(['url:frankchen', 'url:janesmith']);
  });

  it('credits the endorsed skill to the owner', () => {
    expect(result.skills.some((s) => s.personKey === SELF_KEY && s.name === 'Distributed Systems')).toBe(
      true
    );
  });

  it('follows invitation direction to find the counterpart', () => {
    const invite = result.interactions.find((i) => i.kind === 'invitation')!;
    expect(invite.personKey).toBe('url:noorhaddad');
  });
});

describe('normalizeDatasets — career data', () => {
  it('parses job applications including US-style short dates', () => {
    const result = normalizeDatasets([ds('job_applications', 'Job Applications.csv', JOB_APPLICATIONS_CSV)]);
    const job = [...result.jobs.values()][0];
    expect(job.title).toBe('VP Platform');
    expect(job.companyName).toBe('Globex');
    expect(job.appliedAt).toBeUndefined(); // "2/14/26" is a 2-digit year — not guessed
  });
});

describe('normalizeDatasets — resilience', () => {
  it('records an unsupported dataset without failing the run', () => {
    const result = normalizeDatasets([
      {
        dataset: 'company_follows',
        sourceFile: 'Company Follows.csv',
        parse: parseCsvBuffer(Buffer.from('Organization,Followed On\nGlobex,2023-01-01\n')),
      },
    ]);
    expect(result.outcomes[0].accepted).toBe(1);
  });

  it('produces an empty-but-valid result for no input', () => {
    const result = normalizeDatasets([]);
    expect(result.people.size).toBe(0);
    expect(result.outcomes).toEqual([]);
  });
});
