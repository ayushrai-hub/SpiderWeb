import type { DatasetKey } from './datasets.js';
import type { CsvParseResult } from './csv-parser.js';
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
  normalizeSchool,
  normalizeTitle,
  parseCount,
  parseDate,
  profileSlug,
  toDateOnly,
  truncate,
} from './text.js';

/** Placeholder person key for rows that describe the archive owner. */
export const SELF_KEY = '\u0000self';

export interface CanonicalPerson {
  key: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  location?: string;
  industry?: string;
  profileUrl?: string;
  email?: string;
  currentCompany?: string;
  currentTitle?: string;
  connectedAt?: Date;
  isSelf: boolean;
  confidence: number;
  sourceFile: string;
}

export interface CanonicalEmployment {
  personKey: string;
  companyName?: string;
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  startedOn: string | null;
  endedOn: string | null;
  isCurrent: boolean;
  sourceFile: string;
}

export interface CanonicalEducation {
  personKey: string;
  schoolName: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  sourceFile: string;
}

export interface CanonicalSkill {
  personKey: string;
  name: string;
  endorsements: number;
  sourceFile: string;
}

export interface CanonicalContact {
  personKey: string;
  value: string;
  isPrimary: boolean;
  type?: string;
  sourceFile: string;
}

export interface CanonicalConnection {
  personKey: string;
  connectedAt?: Date;
  status: 'connected' | 'invited' | 'pending';
  sourceFile: string;
}

export interface CanonicalCompany {
  key: string;
  name: string;
  linkedinUrl?: string;
  industry?: string;
}

export interface CanonicalProfileField {
  personKey: string;
  fieldName: string;
  fieldValue: string;
  sourceFile: string;
}

export interface CanonicalConversation {
  externalId: string;
  title?: string;
  counterpartName?: string;
  counterpartUrl?: string;
}

export interface CanonicalMessage {
  externalId: string;
  conversationExternalId: string;
  senderName?: string;
  senderUrl?: string;
  recipientName?: string;
  subject?: string;
  content: string;
  sentAt?: Date;
  direction: 'inbound' | 'outbound';
  sourceFile: string;
}

export interface CanonicalActivity {
  externalId: string;
  activityType: 'post' | 'comment' | 'reaction' | 'share' | 'repost' | 'vote';
  content?: string;
  contentUrl?: string;
  createdAt?: Date;
  sourceFile: string;
}

export interface CanonicalJob {
  externalId: string;
  title: string;
  companyName?: string;
  location?: string;
  url?: string;
  appliedAt?: Date;
  savedAt?: Date;
  sourceFile: string;
}

/** An observed touchpoint with someone: endorsement, recommendation, invite. */
export interface CanonicalInteraction {
  personKey: string;
  at?: Date;
  kind: 'endorsement' | 'recommendation_received' | 'recommendation_given' | 'invitation';
}

export interface DatasetOutcome {
  dataset: DatasetKey;
  sourceFile: string;
  discovered: number;
  accepted: number;
  rejected: number;
  warnings: string[];
  errors: string[];
}

export interface NormalizationResult {
  self?: CanonicalPerson;
  people: Map<string, CanonicalPerson>;
  connections: CanonicalConnection[];
  employment: CanonicalEmployment[];
  education: CanonicalEducation[];
  skills: CanonicalSkill[];
  emails: CanonicalContact[];
  phones: CanonicalContact[];
  profileFields: CanonicalProfileField[];
  companies: Map<string, CanonicalCompany>;
  conversations: Map<string, CanonicalConversation>;
  messages: CanonicalMessage[];
  activities: CanonicalActivity[];
  jobs: Map<string, CanonicalJob>;
  interactions: CanonicalInteraction[];
  outcomes: DatasetOutcome[];
}

export function emptyResult(): NormalizationResult {
  return {
    people: new Map(),
    connections: [],
    employment: [],
    education: [],
    skills: [],
    emails: [],
    phones: [],
    profileFields: [],
    companies: new Map(),
    conversations: new Map(),
    messages: [],
    activities: [],
    jobs: new Map(),
    interactions: [],
    outcomes: [],
  };
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * Deterministic identity for a person inside one workspace.
 * Strongest available signal wins; names alone are the last resort and are
 * namespaced separately so they can never silently merge with a URL identity.
 */
export function personKeyFor(input: {
  profileUrl?: string;
  email?: string;
  fullName: string;
  company?: string;
}): string | null {
  const slug = profileSlug(input.profileUrl);
  if (slug) return `url:${slug}`;
  if (input.email) return `email:${input.email}`;
  const name = comparisonKey(input.fullName);
  if (!name) return null;
  const co = companyKey(input.company);
  return co ? `nc:${name}|${co}` : `name:${name}`;
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

/** Merge a person into the result, preferring richer non-empty values. */
function upsertPerson(result: NormalizationResult, person: CanonicalPerson): CanonicalPerson {
  const existing = result.people.get(person.key);
  if (!existing) {
    result.people.set(person.key, person);
    return person;
  }
  const merged: CanonicalPerson = {
    ...existing,
    fullName: existing.fullName || person.fullName,
    firstName: existing.firstName ?? person.firstName,
    lastName: existing.lastName ?? person.lastName,
    headline: existing.headline ?? person.headline,
    location: existing.location ?? person.location,
    industry: existing.industry ?? person.industry,
    profileUrl: existing.profileUrl ?? person.profileUrl,
    email: existing.email ?? person.email,
    currentCompany: existing.currentCompany ?? person.currentCompany,
    currentTitle: existing.currentTitle ?? person.currentTitle,
    connectedAt: existing.connectedAt ?? person.connectedAt,
    isSelf: existing.isSelf || person.isSelf,
    confidence: Math.max(existing.confidence, person.confidence),
  };
  result.people.set(person.key, merged);
  return merged;
}

function addCompany(
  result: NormalizationResult,
  name: string | undefined,
  extra: { linkedinUrl?: string; industry?: string } = {}
): void {
  const normalized = normalizeCompanyName(name);
  if (!normalized) return;
  const key = companyKey(normalized);
  if (!key) return;
  const existing = result.companies.get(key);
  if (existing) {
    if (!existing.linkedinUrl && extra.linkedinUrl) existing.linkedinUrl = extra.linkedinUrl;
    if (!existing.industry && extra.industry) existing.industry = extra.industry;
    return;
  }
  result.companies.set(key, {
    key,
    name: normalized,
    linkedinUrl: extra.linkedinUrl,
    industry: extra.industry,
  });
}

// ---------------------------------------------------------------------------
// Per-dataset normalisers
// ---------------------------------------------------------------------------

type Normalizer = (
  rows: Record<string, string>[],
  result: NormalizationResult,
  sourceFile: string,
  outcome: DatasetOutcome
) => void;

const normalizers: Partial<Record<DatasetKey, Normalizer>> = {
  connections(rows, result, sourceFile, outcome) {
    const connectionByKey = new Map<string, CanonicalConnection>();
    for (const row of rows) {
      const first = clean(pick(row, 'first name', 'firstname'));
      const last = clean(pick(row, 'last name', 'lastname'));
      const name = fullName(first, last);
      if (!name) {
        outcome.rejected++;
        continue;
      }
      const profileUrl = normalizeProfileUrl(
        pick(row, 'url', 'profile url', 'public profile url', 'profileurl')
      );
      const email = normalizeEmail(pick(row, 'email address', 'emailaddress', 'email'));
      const company = normalizeCompanyName(pick(row, 'company', 'company name'));
      const title = normalizeTitle(pick(row, 'position', 'title', 'job title'));
      const key = personKeyFor({ profileUrl, email, fullName: name, company });
      if (!key) {
        outcome.rejected++;
        continue;
      }
      const connectedAt = parseDate(pick(row, 'connected on', 'connectedon', 'connection date')) ?? undefined;

      upsertPerson(result, {
        key,
        fullName: name,
        firstName: first || undefined,
        lastName: last || undefined,
        headline: title && company ? `${title} at ${company}` : (title ?? undefined),
        profileUrl,
        email,
        currentCompany: company,
        currentTitle: title,
        connectedAt,
        isSelf: false,
        confidence: profileUrl ? 100 : email ? 95 : 80,
        sourceFile,
      });

      if (company || title) {
        result.employment.push({
          personKey: key,
          companyName: company,
          title,
          startDate: undefined,
          endDate: undefined,
          startedOn: null,
          endedOn: null,
          isCurrent: true,
          sourceFile,
        });
      }
      addCompany(result, company);
      if (email) result.emails.push({ personKey: key, value: email, isPrimary: true, sourceFile });

      // LinkedIn occasionally repeats a person across export rows; keep one
      // connection and the earliest date we saw for it.
      const existingConnection = connectionByKey.get(key);
      if (existingConnection) {
        if (
          connectedAt &&
          (!existingConnection.connectedAt || connectedAt < existingConnection.connectedAt)
        ) {
          existingConnection.connectedAt = connectedAt;
        }
      } else {
        const connection: CanonicalConnection = {
          personKey: key,
          connectedAt,
          status: 'connected',
          sourceFile,
        };
        connectionByKey.set(key, connection);
        result.connections.push(connection);
      }
      outcome.accepted++;
    }
  },

  profile(rows, result, sourceFile, outcome) {
    for (const row of rows) {
      const first = clean(pick(row, 'first name', 'firstname'));
      const last = clean(pick(row, 'last name', 'lastname'));
      const name = fullName(first, last) || clean(pick(row, 'full name', 'name'));
      if (!name) {
        outcome.rejected++;
        continue;
      }
      const self: CanonicalPerson = {
        key: SELF_KEY,
        fullName: name,
        firstName: first || undefined,
        lastName: last || undefined,
        headline: cleanOptional(pick(row, 'headline')),
        location: normalizeLocation(pick(row, 'geo location', 'location', 'address')),
        industry: cleanOptional(pick(row, 'industry')),
        profileUrl: normalizeProfileUrl(pick(row, 'public profile url', 'profile url', 'url')),
        isSelf: true,
        confidence: 100,
        sourceFile,
      };
      result.self = result.self ? { ...result.self, ...stripUndefined(self) } : self;
      upsertPerson(result, result.self);

      for (const [field, header] of [
        ['summary', 'summary'],
        ['websites', 'websites'],
        ['twitter_handles', 'twitter handles'],
        ['maiden_name', 'maiden name'],
      ] as const) {
        const value = cleanOptional(pick(row, header));
        if (value) {
          result.profileFields.push({
            personKey: SELF_KEY,
            fieldName: field,
            fieldValue: truncate(value, 8000),
            sourceFile,
          });
        }
      }
      outcome.accepted++;
      break; // Profile.csv describes exactly one person.
    }
  },

  positions(rows, result, sourceFile, outcome) {
    for (const row of rows) {
      const company = normalizeCompanyName(pick(row, 'company name', 'company'));
      const title = normalizeTitle(pick(row, 'title', 'position'));
      if (!company && !title) {
        outcome.rejected++;
        continue;
      }
      const startRaw = cleanOptional(pick(row, 'started on', 'start date'));
      const endRaw = cleanOptional(pick(row, 'finished on', 'end date'));
      result.employment.push({
        personKey: SELF_KEY,
        companyName: company,
        title,
        description: cleanOptional(pick(row, 'description')),
        startDate: startRaw,
        endDate: endRaw,
        startedOn: toDateOnly(parseDate(startRaw)),
        endedOn: toDateOnly(parseDate(endRaw)),
        isCurrent: !endRaw,
        sourceFile,
      });
      addCompany(result, company);
      outcome.accepted++;
    }
  },

  education(rows, result, sourceFile, outcome) {
    for (const row of rows) {
      const school = normalizeSchool(pick(row, 'school name', 'school'));
      if (!school) {
        outcome.rejected++;
        continue;
      }
      result.education.push({
        personKey: SELF_KEY,
        schoolName: school,
        degree: cleanOptional(pick(row, 'degree name', 'degree')),
        fieldOfStudy: cleanOptional(pick(row, 'field of study', 'notes')),
        startDate: cleanOptional(pick(row, 'start date', 'started on')),
        endDate: cleanOptional(pick(row, 'end date', 'finished on')),
        sourceFile,
      });
      outcome.accepted++;
    }
  },

  skills(rows, result, sourceFile, outcome) {
    for (const row of rows) {
      const name = cleanOptional(pick(row, 'name', 'skill', 'skill name'));
      if (!name) {
        outcome.rejected++;
        continue;
      }
      result.skills.push({
        personKey: SELF_KEY,
        name,
        endorsements: parseCount(pick(row, 'endorsements', 'endorsement count')),
        sourceFile,
      });
      outcome.accepted++;
    }
  },

  email_addresses(rows, result, sourceFile, outcome) {
    for (const row of rows) {
      const email = normalizeEmail(pick(row, 'email address', 'email'));
      if (!email) {
        outcome.rejected++;
        continue;
      }
      result.emails.push({
        personKey: SELF_KEY,
        value: email,
        isPrimary: /^yes|true$/i.test(clean(pick(row, 'primary'))),
        sourceFile,
      });
      outcome.accepted++;
    }
  },

  phone_numbers(rows, result, sourceFile, outcome) {
    for (const row of rows) {
      const phone = normalizePhone(pick(row, 'number', 'phone number', 'phone'));
      if (!phone) {
        outcome.rejected++;
        continue;
      }
      result.phones.push({
        personKey: SELF_KEY,
        value: phone,
        isPrimary: false,
        type: cleanOptional(pick(row, 'type')),
        sourceFile,
      });
      outcome.accepted++;
    }
  },

  certifications: profileListNormalizer('certifications', (row) => {
    const name = cleanOptional(pick(row, 'name', 'title'));
    if (!name) return null;
    const authority = cleanOptional(pick(row, 'authority'));
    return authority ? `${name} — ${authority}` : name;
  }),

  languages: profileListNormalizer('languages', (row) => {
    const name = cleanOptional(pick(row, 'name', 'language'));
    if (!name) return null;
    const proficiency = cleanOptional(pick(row, 'proficiency'));
    return proficiency ? `${name} (${proficiency})` : name;
  }),

  projects: profileListNormalizer('projects', (row) => cleanOptional(pick(row, 'title', 'name')) ?? null),
  honors: profileListNormalizer('honors', (row) => cleanOptional(pick(row, 'title', 'name')) ?? null),
  courses: profileListNormalizer('courses', (row) => cleanOptional(pick(row, 'name', 'title')) ?? null),

  volunteering(rows, result, sourceFile, outcome) {
    for (const row of rows) {
      const org = normalizeCompanyName(pick(row, 'company name', 'organization'));
      const role = normalizeTitle(pick(row, 'role', 'title'));
      if (!org && !role) {
        outcome.rejected++;
        continue;
      }
      const startRaw = cleanOptional(pick(row, 'started on', 'start date'));
      const endRaw = cleanOptional(pick(row, 'finished on', 'end date'));
      result.employment.push({
        personKey: SELF_KEY,
        companyName: org,
        title: role ? `${role} (volunteer)` : 'Volunteer',
        description: cleanOptional(pick(row, 'description', 'cause')),
        startDate: startRaw,
        endDate: endRaw,
        startedOn: toDateOnly(parseDate(startRaw)),
        endedOn: toDateOnly(parseDate(endRaw)),
        isCurrent: !endRaw,
        sourceFile,
      });
      addCompany(result, org);
      outcome.accepted++;
    }
  },

  invitations(rows, result, sourceFile, outcome) {
    const selfName = comparisonKey(result.self?.fullName ?? '');
    for (const row of rows) {
      const direction = clean(pick(row, 'direction')).toUpperCase();
      const from = clean(pick(row, 'from'));
      const to = clean(pick(row, 'to'));
      const outgoing = direction ? direction === 'OUTGOING' : comparisonKey(from) === selfName;
      const counterpartName = outgoing ? to : from;
      const counterpartUrl = normalizeProfileUrl(
        outgoing
          ? pick(row, 'inviteeprofileurl', 'invitee profile url')
          : pick(row, 'inviterprofileurl', 'inviter profile url')
      );
      if (!counterpartName && !counterpartUrl) {
        outcome.rejected++;
        continue;
      }
      const key = personKeyFor({ profileUrl: counterpartUrl, fullName: counterpartName || counterpartUrl! });
      if (!key) {
        outcome.rejected++;
        continue;
      }
      const sentAt = parseDate(pick(row, 'sent at', 'sentat', 'date')) ?? undefined;
      upsertPerson(result, {
        key,
        fullName: counterpartName || counterpartUrl!,
        profileUrl: counterpartUrl,
        isSelf: false,
        confidence: counterpartUrl ? 90 : 60,
        sourceFile,
      });
      result.interactions.push({ personKey: key, at: sentAt, kind: 'invitation' });
      outcome.accepted++;
    }
  },

  company_follows(rows, result, sourceFile, outcome) {
    for (const row of rows) {
      const org = normalizeCompanyName(pick(row, 'organization', 'company', 'company name'));
      if (!org) {
        outcome.rejected++;
        continue;
      }
      addCompany(result, org);
      outcome.accepted++;
    }
  },

  endorsements_received(rows, result, sourceFile, outcome) {
    for (const row of rows) {
      const first = clean(pick(row, 'endorser first name'));
      const last = clean(pick(row, 'endorser last name'));
      const name = fullName(first, last);
      const url = normalizeProfileUrl(pick(row, 'endorser public url', 'endorser profile url'));
      const skill = cleanOptional(pick(row, 'skill name', 'skill'));
      if (skill) {
        result.skills.push({ personKey: SELF_KEY, name: skill, endorsements: 1, sourceFile });
      }
      if (!name && !url) {
        outcome.rejected++;
        continue;
      }
      const key = personKeyFor({ profileUrl: url, fullName: name || url! });
      if (!key) {
        outcome.rejected++;
        continue;
      }
      upsertPerson(result, {
        key,
        fullName: name || url!,
        firstName: first || undefined,
        lastName: last || undefined,
        profileUrl: url,
        isSelf: false,
        confidence: url ? 90 : 60,
        sourceFile,
      });
      result.interactions.push({
        personKey: key,
        at: parseDate(pick(row, 'endorsement date', 'date')) ?? undefined,
        kind: 'endorsement',
      });
      outcome.accepted++;
    }
  },

  recommendations_received: recommendationNormalizer('recommendation_received'),
  recommendations_given: recommendationNormalizer('recommendation_given'),

  messages(rows, result, sourceFile, outcome) {
    const selfName = comparisonKey(result.self?.fullName ?? '');
    const selfSlug = profileSlug(result.self?.profileUrl);
    let index = 0;
    for (const row of rows) {
      index++;
      const content = clean(pick(row, 'content', 'message', 'body'));
      const from = clean(pick(row, 'from', 'sender name'));
      const to = clean(pick(row, 'to', 'recipient'));
      const senderUrl = normalizeProfileUrl(pick(row, 'sender profile url', 'senderprofileurl'));
      const sentAt = parseDate(pick(row, 'date', 'sent date', 'created at')) ?? undefined;
      if (!content && !from && !to) {
        outcome.rejected++;
        continue;
      }

      const folder = clean(pick(row, 'folder')).toUpperCase();
      const senderIsSelf =
        folder === 'SENT'
          ? true
          : selfSlug && senderUrl
            ? profileSlug(senderUrl) === selfSlug
            : selfName
              ? comparisonKey(from) === selfName
              : false;
      const direction: 'inbound' | 'outbound' = senderIsSelf ? 'outbound' : 'inbound';

      const counterpartName = senderIsSelf ? to : from;
      const counterpartUrl = senderIsSelf
        ? normalizeProfileUrl(pick(row, 'recipient profile urls', 'recipientprofileurls'))
        : senderUrl;

      const conversationExternalId =
        cleanOptional(pick(row, 'conversation id', 'conversationid')) ??
        `counterpart:${comparisonKey(counterpartName) || profileSlug(counterpartUrl) || 'unknown'}`;

      if (!result.conversations.has(conversationExternalId)) {
        result.conversations.set(conversationExternalId, {
          externalId: conversationExternalId,
          title: cleanOptional(pick(row, 'conversation title', 'subject')) ?? (counterpartName || undefined),
          counterpartName: counterpartName || undefined,
          counterpartUrl,
        });
      }

      result.messages.push({
        // LinkedIn does not give messages a stable id; derive one that is
        // stable across re-imports of the same archive content.
        externalId: `${conversationExternalId}#${sentAt?.toISOString() ?? `row${index}`}#${hash(content)}`,
        conversationExternalId,
        senderName: from || undefined,
        senderUrl,
        recipientName: to || undefined,
        subject: cleanOptional(pick(row, 'subject')),
        content: truncate(content, 20000),
        sentAt,
        direction,
        sourceFile,
      });
      outcome.accepted++;
    }
  },

  comments: activityNormalizer('comment', (row) => ({
    content: cleanOptional(pick(row, 'message', 'comment', 'content')),
    url: cleanOptional(pick(row, 'link', 'url')),
    at: parseDate(pick(row, 'date')),
  })),

  reactions: activityNormalizer('reaction', (row) => ({
    content: cleanOptional(pick(row, 'type')),
    url: cleanOptional(pick(row, 'link', 'url')),
    at: parseDate(pick(row, 'date')),
  })),

  shares: activityNormalizer('share', (row) => ({
    content: cleanOptional(pick(row, 'sharecommentary', 'share commentary', 'commentary')),
    url: cleanOptional(pick(row, 'sharelink', 'share link', 'sharedurl', 'shared url', 'link')),
    at: parseDate(pick(row, 'date')),
  })),

  job_applications(rows, result, sourceFile, outcome) {
    for (const row of rows) {
      const title = cleanOptional(pick(row, 'job title', 'title'));
      const company = normalizeCompanyName(pick(row, 'company name', 'company'));
      if (!title && !company) {
        outcome.rejected++;
        continue;
      }
      const url = cleanOptional(pick(row, 'job url', 'url'));
      const appliedAt = parseDate(pick(row, 'application date', 'applied on', 'date')) ?? undefined;
      const externalId = `application:${url ?? `${comparisonKey(company)}|${comparisonKey(title)}|${appliedAt?.toISOString() ?? ''}`}`;
      mergeJob(result, {
        externalId,
        title: title ?? company!,
        companyName: company,
        url,
        appliedAt,
        sourceFile,
      });
      addCompany(result, company);
      outcome.accepted++;
    }
  },

  saved_jobs(rows, result, sourceFile, outcome) {
    for (const row of rows) {
      const title = cleanOptional(pick(row, 'job title', 'title'));
      const company = normalizeCompanyName(pick(row, 'company name', 'company'));
      if (!title && !company) {
        outcome.rejected++;
        continue;
      }
      const url = cleanOptional(pick(row, 'job url', 'url'));
      const savedAt = parseDate(pick(row, 'saved date', 'date')) ?? undefined;
      const externalId = `saved:${url ?? `${comparisonKey(company)}|${comparisonKey(title)}`}`;
      mergeJob(result, {
        externalId,
        title: title ?? company!,
        companyName: company,
        url,
        savedAt,
        sourceFile,
      });
      addCompany(result, company);
      outcome.accepted++;
    }
  },
};

function mergeJob(result: NormalizationResult, job: CanonicalJob): void {
  const existing = result.jobs.get(job.externalId);
  if (!existing) {
    result.jobs.set(job.externalId, job);
    return;
  }
  result.jobs.set(job.externalId, {
    ...existing,
    companyName: existing.companyName ?? job.companyName,
    location: existing.location ?? job.location,
    url: existing.url ?? job.url,
    appliedAt: existing.appliedAt ?? job.appliedAt,
    savedAt: existing.savedAt ?? job.savedAt,
  });
}

function profileListNormalizer(
  fieldName: string,
  extract: (row: Record<string, string>) => string | null
): Normalizer {
  return (rows, result, sourceFile, outcome) => {
    const values: string[] = [];
    for (const row of rows) {
      const value = extract(row);
      if (!value) {
        outcome.rejected++;
        continue;
      }
      values.push(value);
      outcome.accepted++;
    }
    if (values.length > 0) {
      result.profileFields.push({
        personKey: SELF_KEY,
        fieldName,
        fieldValue: truncate(values.join('; '), 8000),
        sourceFile,
      });
    }
  };
}

function recommendationNormalizer(kind: 'recommendation_received' | 'recommendation_given'): Normalizer {
  return (rows, result, sourceFile, outcome) => {
    for (const row of rows) {
      const first = clean(pick(row, 'first name', 'firstname'));
      const last = clean(pick(row, 'last name', 'lastname'));
      const name = fullName(first, last);
      if (!name) {
        outcome.rejected++;
        continue;
      }
      const company = normalizeCompanyName(pick(row, 'company', 'company name'));
      const title = normalizeTitle(pick(row, 'job title', 'title'));
      const key = personKeyFor({ fullName: name, company });
      if (!key) {
        outcome.rejected++;
        continue;
      }
      upsertPerson(result, {
        key,
        fullName: name,
        firstName: first || undefined,
        lastName: last || undefined,
        currentCompany: company,
        currentTitle: title,
        headline: title && company ? `${title} at ${company}` : title,
        isSelf: false,
        confidence: 70,
        sourceFile,
      });
      addCompany(result, company);
      result.interactions.push({
        personKey: key,
        at: parseDate(pick(row, 'creation date', 'date')) ?? undefined,
        kind,
      });
      outcome.accepted++;
    }
  };
}

function activityNormalizer(
  activityType: 'comment' | 'reaction' | 'share',
  extract: (row: Record<string, string>) => { content?: string; url?: string; at: Date | null }
): Normalizer {
  return (rows, result, sourceFile, outcome) => {
    let index = 0;
    for (const row of rows) {
      index++;
      const { content, url, at } = extract(row);
      if (!content && !url) {
        outcome.rejected++;
        continue;
      }
      result.activities.push({
        externalId: `${activityType}:${url ?? ''}:${at?.toISOString() ?? `row${index}`}:${hash(content ?? '')}`,
        activityType,
        content: content ? truncate(content, 8000) : undefined,
        contentUrl: url,
        createdAt: at ?? undefined,
        sourceFile,
      });
      outcome.accepted++;
    }
  };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Small non-cryptographic hash, used only to make derived ids stable. */
function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface ParsedDataset {
  dataset: DatasetKey;
  sourceFile: string;
  parse: CsvParseResult;
}

/**
 * Order matters: Profile.csv establishes who "self" is, which message
 * direction and invitation direction depend on.
 */
const DATASET_ORDER: DatasetKey[] = [
  'profile',
  'email_addresses',
  'phone_numbers',
  'positions',
  'education',
  'skills',
  'certifications',
  'languages',
  'projects',
  'honors',
  'courses',
  'volunteering',
  'connections',
  'invitations',
  'company_follows',
  'endorsements_received',
  'recommendations_received',
  'recommendations_given',
  'messages',
  'comments',
  'reactions',
  'shares',
  'job_applications',
  'saved_jobs',
];

/**
 * Merge weakly-identified people into strongly-identified ones.
 *
 * Datasets such as Recommendations_Received.csv carry a name but no profile
 * URL, so they produce an `nc:`/`name:` key while Connections.csv produced a
 * `url:` key for the same human. A merge happens only when the name matches
 * exactly one strong identity — an ambiguous name is left alone, because
 * wrongly merging two people is worse than showing two records.
 */
export function reconcileWeakIdentities(result: NormalizationResult): number {
  const strongByName = new Map<string, string[]>();
  for (const [key, person] of result.people) {
    if (!key.startsWith('url:') && !key.startsWith('email:')) continue;
    const name = comparisonKey(person.fullName);
    if (!name) continue;
    const list = strongByName.get(name);
    if (list) list.push(key);
    else strongByName.set(name, [key]);
  }

  const remap = new Map<string, string>();
  for (const [key, person] of result.people) {
    if (key.startsWith('url:') || key.startsWith('email:')) continue;
    const candidates = strongByName.get(comparisonKey(person.fullName));
    if (candidates && candidates.length === 1) remap.set(key, candidates[0]);
  }
  if (remap.size === 0) return 0;

  for (const [from, to] of remap) {
    const weak = result.people.get(from)!;
    const strong = result.people.get(to)!;
    result.people.set(to, {
      ...strong,
      headline: strong.headline ?? weak.headline,
      location: strong.location ?? weak.location,
      industry: strong.industry ?? weak.industry,
      email: strong.email ?? weak.email,
      currentCompany: strong.currentCompany ?? weak.currentCompany,
      currentTitle: strong.currentTitle ?? weak.currentTitle,
      connectedAt: strong.connectedAt ?? weak.connectedAt,
    });
    result.people.delete(from);
  }

  const swap = (key: string): string => remap.get(key) ?? key;
  for (const c of result.connections) c.personKey = swap(c.personKey);
  for (const e of result.employment) e.personKey = swap(e.personKey);
  for (const e of result.education) e.personKey = swap(e.personKey);
  for (const s of result.skills) s.personKey = swap(s.personKey);
  for (const e of result.emails) e.personKey = swap(e.personKey);
  for (const p of result.phones) p.personKey = swap(p.personKey);
  for (const f of result.profileFields) f.personKey = swap(f.personKey);
  for (const i of result.interactions) i.personKey = swap(i.personKey);

  return remap.size;
}

export function normalizeDatasets(parsed: ParsedDataset[]): NormalizationResult {
  const result = emptyResult();
  const ordered = [...parsed].sort(
    (a, b) => DATASET_ORDER.indexOf(a.dataset) - DATASET_ORDER.indexOf(b.dataset)
  );

  for (const item of ordered) {
    const outcome: DatasetOutcome = {
      dataset: item.dataset,
      sourceFile: item.sourceFile,
      discovered: item.parse.rows.length,
      accepted: 0,
      rejected: 0,
      warnings: [...item.parse.warnings],
      errors: [...item.parse.errors],
    };
    const normalizer = normalizers[item.dataset];
    if (!normalizer) {
      outcome.warnings.push('Recognised but not imported.');
      result.outcomes.push(outcome);
      continue;
    }
    try {
      normalizer(item.parse.rows, result, item.sourceFile, outcome);
    } catch (err) {
      // A dataset-level failure must not abort the whole import.
      outcome.errors.push(`Could not process this file: ${(err as Error).message}`);
    }
    result.outcomes.push(outcome);
  }

  reconcileWeakIdentities(result);
  return result;
}
