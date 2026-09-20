import { headerKey } from './csv-parser.js';

/**
 * LinkedIn dataset catalogue.
 *
 * Archives differ by account age, region and which export tier the user
 * requested, so detection is two-stage: filename first (fast, exact), then a
 * header signature (survives renamed or localised filenames).
 */

export type DatasetKey =
  // identity (the archive owner)
  | 'profile'
  | 'positions'
  | 'education'
  | 'skills'
  | 'email_addresses'
  | 'phone_numbers'
  | 'certifications'
  | 'languages'
  | 'projects'
  | 'honors'
  | 'courses'
  | 'volunteering'
  // network
  | 'connections'
  | 'invitations'
  | 'company_follows'
  // relationship signals
  | 'endorsements_received'
  | 'recommendations_received'
  | 'recommendations_given'
  // communication
  | 'messages'
  // activity
  | 'comments'
  | 'reactions'
  | 'shares'
  // career
  | 'job_applications'
  | 'saved_jobs';

export type DatasetCategory = 'identity' | 'network' | 'signals' | 'communication' | 'activity' | 'career';

export interface DatasetSpec {
  key: DatasetKey;
  label: string;
  category: DatasetCategory;
  /** Filename patterns (matched against the basename). */
  filenames: RegExp[];
  /**
   * Header keys that must all be present for a signature match. Kept minimal
   * and distinctive so a partial-column export still matches.
   */
  signature: string[][];
}

export const DATASETS: DatasetSpec[] = [
  {
    key: 'connections',
    label: 'Connections',
    category: 'network',
    filenames: [/^connections\.csv$/i],
    signature: [
      ['first name', 'last name', 'connected on'],
      ['first name', 'last name', 'url', 'company'],
    ],
  },
  {
    key: 'profile',
    label: 'Profile',
    category: 'identity',
    filenames: [/^profile\.csv$/i, /^profile\s*summary\.csv$/i],
    signature: [
      ['first name', 'last name', 'headline'],
      ['first name', 'last name', 'industry'],
    ],
  },
  {
    key: 'positions',
    label: 'Positions',
    category: 'identity',
    filenames: [/^positions\.csv$/i],
    signature: [
      ['company name', 'title', 'started on'],
      ['company name', 'title', 'finished on'],
    ],
  },
  {
    key: 'education',
    label: 'Education',
    category: 'identity',
    filenames: [/^education\.csv$/i],
    signature: [
      ['school name', 'start date'],
      ['school name', 'degree name'],
    ],
  },
  {
    key: 'skills',
    label: 'Skills',
    category: 'identity',
    filenames: [/^skills\.csv$/i],
    signature: [],
  },
  {
    key: 'email_addresses',
    label: 'Email Addresses',
    category: 'identity',
    filenames: [/^email\s*addresses\.csv$/i],
    signature: [['email address', 'primary']],
  },
  {
    key: 'phone_numbers',
    label: 'Phone Numbers',
    category: 'identity',
    filenames: [/^phone\s*numbers\.csv$/i],
    signature: [['number', 'type']],
  },
  {
    key: 'certifications',
    label: 'Certifications',
    category: 'identity',
    filenames: [/^certifications\.csv$/i],
    signature: [['name', 'authority']],
  },
  {
    key: 'languages',
    label: 'Languages',
    category: 'identity',
    filenames: [/^languages\.csv$/i],
    signature: [['name', 'proficiency']],
  },
  {
    key: 'projects',
    label: 'Projects',
    category: 'identity',
    filenames: [/^projects\.csv$/i],
    signature: [['title', 'started on', 'url']],
  },
  {
    key: 'honors',
    label: 'Honors & Awards',
    category: 'identity',
    filenames: [/^honors\.csv$/i, /^honors\s*(&|and)?\s*awards\.csv$/i],
    signature: [['title', 'issued on']],
  },
  {
    key: 'courses',
    label: 'Courses',
    category: 'identity',
    filenames: [/^courses\.csv$/i],
    signature: [['name', 'number']],
  },
  {
    key: 'volunteering',
    label: 'Volunteering',
    category: 'identity',
    filenames: [/^volunteering\.csv$/i, /^volunteer\s*experience\.csv$/i],
    signature: [['company name', 'role', 'cause']],
  },
  {
    key: 'invitations',
    label: 'Invitations',
    category: 'network',
    filenames: [/^invitations\.csv$/i],
    signature: [['from', 'to', 'sent at']],
  },
  {
    key: 'company_follows',
    label: 'Company Follows',
    category: 'network',
    filenames: [/^company\s*follows\.csv$/i],
    signature: [['organization', 'followed on']],
  },
  {
    key: 'endorsements_received',
    label: 'Endorsements Received',
    category: 'signals',
    filenames: [/^endorsement_received_info\.csv$/i, /^endorsements?\s*received.*\.csv$/i],
    signature: [['skill name', 'endorser first name']],
  },
  {
    key: 'recommendations_received',
    label: 'Recommendations Received',
    category: 'signals',
    filenames: [/^recommendations[_\s]*received\.csv$/i],
    signature: [['first name', 'last name', 'text', 'creation date']],
  },
  {
    key: 'recommendations_given',
    label: 'Recommendations Given',
    category: 'signals',
    filenames: [/^recommendations[_\s]*given\.csv$/i],
    signature: [],
  },
  {
    key: 'messages',
    label: 'Messages',
    category: 'communication',
    filenames: [/^messages\.csv$/i],
    signature: [
      ['conversation id', 'from', 'content'],
      ['from', 'to', 'date', 'content'],
    ],
  },
  {
    key: 'comments',
    label: 'Comments',
    category: 'activity',
    filenames: [/^comments\.csv$/i],
    signature: [['date', 'link', 'message']],
  },
  {
    key: 'reactions',
    label: 'Reactions',
    category: 'activity',
    filenames: [/^reactions\.csv$/i, /^votes\.csv$/i],
    signature: [['date', 'type', 'link']],
  },
  {
    key: 'shares',
    label: 'Shares',
    category: 'activity',
    filenames: [/^shares\.csv$/i],
    signature: [
      ['date', 'sharelink'],
      ['date', 'share link'],
    ],
  },
  {
    key: 'job_applications',
    label: 'Job Applications',
    category: 'career',
    filenames: [/^job\s*applications\.csv$/i, /^jobs?[_\s]*applied.*\.csv$/i],
    signature: [['application date', 'company name', 'job title']],
  },
  {
    key: 'saved_jobs',
    label: 'Saved Jobs',
    category: 'career',
    filenames: [/^saved\s*jobs\.csv$/i],
    signature: [['saved date', 'job title']],
  },
];

const BY_KEY = new Map(DATASETS.map((d) => [d.key, d]));

export function getDataset(key: DatasetKey): DatasetSpec {
  const spec = BY_KEY.get(key);
  if (!spec) throw new Error(`Unknown dataset ${key}`);
  return spec;
}

/**
 * Datasets LinkedIn ships that SpiderWeb deliberately does not import:
 * advertising, security and telemetry data that carries no relationship value
 * and that users would not expect a network tool to retain.
 */
export const IGNORED_FILENAMES: { pattern: RegExp; reason: string }[] = [
  { pattern: /^ad[_\s]*targeting\.csv$/i, reason: 'Advertising data — not imported by design' },
  { pattern: /^ads?[_\s]*clicked\.csv$/i, reason: 'Advertising data — not imported by design' },
  { pattern: /^registration\.csv$/i, reason: 'Account telemetry — not imported by design' },
  { pattern: /^logins?\.csv$/i, reason: 'Account telemetry — not imported by design' },
  { pattern: /^login[_\s]*history\.csv$/i, reason: 'Account telemetry — not imported by design' },
  { pattern: /^security[_\s]*challenges\.csv$/i, reason: 'Security telemetry — not imported by design' },
  {
    pattern: /^account[_\s]*status[_\s]*history\.csv$/i,
    reason: 'Account telemetry — not imported by design',
  },
  { pattern: /^rich[_\s]*media\.csv$/i, reason: 'Media index — nothing to import' },
  { pattern: /^searchqueries\.csv$/i, reason: 'Search history — not imported by design' },
  { pattern: /^inferences.*\.csv$/i, reason: 'LinkedIn ad inferences — not imported by design' },
  { pattern: /^device[_\s]*information\.csv$/i, reason: 'Device telemetry — not imported by design' },
  { pattern: /^ip[_\s]*addresses.*\.csv$/i, reason: 'Security telemetry — not imported by design' },
];

export function isIgnoredFilename(basename: string): string | null {
  for (const { pattern, reason } of IGNORED_FILENAMES) {
    if (pattern.test(basename)) return reason;
  }
  return null;
}

export function matchByFilename(basename: string): DatasetSpec | null {
  for (const spec of DATASETS) {
    if (spec.filenames.some((p) => p.test(basename))) return spec;
  }
  return null;
}

/**
 * Identify a dataset from its column headers. Used when the filename is
 * unrecognised (renamed file, localised archive, single-CSV upload).
 */
export function matchByHeaders(headers: string[]): DatasetSpec | null {
  const keys = new Set(headers.map(headerKey));
  let best: { spec: DatasetSpec; score: number } | null = null;
  for (const spec of DATASETS) {
    for (const combo of spec.signature) {
      if (combo.length === 0) continue;
      if (combo.every((c) => keys.has(c))) {
        const score = combo.length;
        if (!best || score > best.score) best = { spec, score };
      }
    }
  }
  return best?.spec ?? null;
}

export function detectDataset(basename: string, headers: string[]): DatasetSpec | null {
  return matchByFilename(basename) ?? matchByHeaders(headers);
}
