import type { CsvParseResult } from './csv-parser.js';

// Canonical types matching database schema
export interface NormalizedPerson {
  workspaceId: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  company?: string;
  title?: string;
  location?: string;
  profileUrl?: string;
  linkedinId?: string;
  sourceType: 'linkedin';
  sourceFile: string;
  confidence: number;
  observedAt: Date;
}

export interface NormalizedCompany {
  workspaceId: string;
  canonicalName: string;
  domain?: string;
  linkedinUrl?: string;
  industry?: string;
  size?: string;
  location?: string;
  description?: string;
  sourceType: 'linkedin';
  confidence: number;
  observedAt: Date;
}

export interface NormalizedConnection {
  workspaceId: string;
  personId?: string;
  connectedAt?: Date;
  sourceFile: string;
  status: 'connected' | 'invited' | 'pending';
}

export interface NormalizedMessage {
  workspaceId: string;
  conversationId?: string;
  senderId?: string;
  recipientId?: string;
  content: string;
  direction: 'inbound' | 'outbound';
  sentAt?: Date;
  sourceFile: string;
}

export interface NormalizedActivity {
  workspaceId: string;
  personId?: string;
  activityType: 'post' | 'comment' | 'reaction' | 'share' | 'repost' | 'vote';
  content?: string;
  contentUrl?: string;
  createdAt?: Date;
  sourceFile: string;
}

export interface NormalizedJob {
  workspaceId: string;
  title: string;
  company?: string;
  location?: string;
  description?: string;
  url?: string;
  postedAt?: Date;
  sourceFile: string;
}

export interface NormalizedEducation {
  workspaceId: string;
  personId?: string;
  school: string;
  degree?: string;
  field?: string;
  startDate?: Date;
  endDate?: Date;
  sourceFile: string;
}

export interface NormalizedSkill {
  workspaceId: string;
  personId?: string;
  skill: string;
  endorsements?: number;
  sourceFile: string;
}

export interface NormalizedInsight {
  workspaceId: string;
  insightType: string;
  title: string;
  description: string;
  evidence: string[];
  confidence: number;
  generatedAt: Date;
}

export interface NormalizationResult {
  persons: NormalizedPerson[];
  companies: NormalizedCompany[];
  connections: NormalizedConnection[];
  messages: NormalizedMessage[];
  activities: NormalizedActivity[];
  jobs: NormalizedJob[];
  education: NormalizedEducation[];
  skills: NormalizedSkill[];
  insights: NormalizedInsight[];
  warnings: string[];
  errors: string[];
}

function parseLinkedInDate(dateStr: string | undefined): Date | undefined {
  if (!dateStr) return undefined;
  
  // LinkedIn uses various date formats
  const formats = [
    /^(?<month>\d{1,2})\/(?<day>\d{1,2})\/(?<year>\d{4})$/,
    /^(?<year>\d{4})-(?<month>\d{1,2})-(?<day>\d{1,2})$/,
    /^(?<month>\w+)\s+(?<day>\d{1,2}),?\s+(?<year>\d{4})$/,
  ];
  
  for (const format of formats) {
    const match = dateStr.match(format);
    if (match?.groups) {
      const { year, month, day } = match.groups;
      const monthNum = isNaN(parseInt(month)) 
        ? new Date(`${month} 1, 2000`).getMonth() + 1
        : parseInt(month);
      return new Date(parseInt(year), monthNum - 1, parseInt(day));
    }
  }
  
  // Try native parsing as fallback
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizeConnections(
  records: Record<string, string>[],
  workspaceId: string,
  sourceFile: string
): { persons: NormalizedPerson[]; connections: NormalizedConnection[] } {
  const persons: NormalizedPerson[] = [];
  const connections: NormalizedConnection[] = [];

  for (const record of records) {
    const firstName = record['First Name'] || record['firstName'] || '';
    const lastName = record['Last Name'] || record['lastName'] || '';
    const fullName = `${firstName} ${lastName}`.trim();
    
    if (!fullName) continue;

    const person: NormalizedPerson = {
      workspaceId,
      fullName,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      email: record['Email Address'] || record['email'] || undefined,
      company: record['Company'] || record['company'] || undefined,
      title: record['Position'] || record['title'] || undefined,
      location: record['Location'] || record['location'] || undefined,
      profileUrl: record['Profile URL'] || record['url'] || undefined,
      linkedinId: record['ID'] || record['id'] || undefined,
      sourceType: 'linkedin',
      sourceFile,
      confidence: 95,
      observedAt: new Date(),
    };
    persons.push(person);

    const connection: NormalizedConnection = {
      workspaceId,
      connectedAt: parseLinkedInDate(record['Connected On'] || record['connectedOn']),
      sourceFile,
      status: 'connected',
    };
    connections.push(connection);
  }

  return { persons, connections };
}

function normalizeMessages(
  records: Record<string, string>[],
  workspaceId: string,
  sourceFile: string
): NormalizedMessage[] {
  const messages: NormalizedMessage[] = [];

  for (const record of records) {
    const content = record['Message Content'] || record['content'] || '';
    if (!content) continue;

    const message: NormalizedMessage = {
      workspaceId,
      content,
      direction: record['Direction'] === 'Outbound' ? 'outbound' : 'inbound',
      sentAt: parseLinkedInDate(record['Sent Date'] || record['sentDate']),
      sourceFile,
    };
    messages.push(message);
  }

  return messages;
}

function normalizeProfile(
  records: Record<string, string>[],
  workspaceId: string,
  sourceFile: string
): { persons: NormalizedPerson[]; companies: NormalizedCompany[] } {
  const persons: NormalizedPerson[] = [];
  const companies: NormalizedCompany[] = [];

  for (const record of records) {
    const fullName = record['Full Name'] || record['Name'] || '';
    if (fullName) {
      const person: NormalizedPerson = {
        workspaceId,
        fullName,
        email: record['Email'] || undefined,
        company: record['Company'] || undefined,
        title: record['Title'] || record['Headline'] || undefined,
        location: record['Location'] || undefined,
        profileUrl: record['Profile URL'] || record['LinkedIn URL'] || undefined,
        sourceType: 'linkedin',
        sourceFile,
        confidence: 100,
        observedAt: new Date(),
      };
      persons.push(person);
    }

    const companyName = record['Company'] || record['Current Company'];
    if (companyName) {
      const company: NormalizedCompany = {
        workspaceId,
        canonicalName: companyName,
        industry: record['Industry'] || undefined,
        location: record['Company Location'] || undefined,
        sourceType: 'linkedin',
        confidence: 90,
        observedAt: new Date(),
      };
      companies.push(company);
    }
  }

  return { persons, companies };
}

function normalizeEducation(
  records: Record<string, string>[],
  workspaceId: string,
  sourceFile: string
): NormalizedEducation[] {
  const education: NormalizedEducation[] = [];

  for (const record of records) {
    const school = record['School Name'] || record['school'] || '';
    if (!school) continue;

    education.push({
      workspaceId,
      school,
      degree: record['Degree Name'] || record['degree'] || undefined,
      field: record['Field of Study'] || record['field'] || undefined,
      startDate: parseLinkedInDate(record['Start Date'] || record['startDate']),
      endDate: parseLinkedInDate(record['End Date'] || record['endDate']),
      sourceFile,
    });
  }

  return education;
}

function normalizeSkills(
  records: Record<string, string>[],
  workspaceId: string,
  sourceFile: string
): NormalizedSkill[] {
  const skills: NormalizedSkill[] = [];

  for (const record of records) {
    const skill = record['Skill'] || record['skill'] || record['Name'] || '';
    if (!skill) continue;

    skills.push({
      workspaceId,
      skill,
      endorsements: parseInt(record['Endorsements'] || record['endorsements'] || '0') || 0,
      sourceFile,
    });
  }

  return skills;
}

function normalizeJobs(
  records: Record<string, string>[],
  workspaceId: string,
  sourceFile: string
): NormalizedJob[] {
  const jobs: NormalizedJob[] = [];

  for (const record of records) {
    const title = record['Job Title'] || record['title'] || record['Title'] || '';
    if (!title) continue;

    jobs.push({
      workspaceId,
      title,
      company: record['Company'] || record['company'] || undefined,
      location: record['Location'] || record['location'] || undefined,
      description: record['Description'] || record['description'] || undefined,
      url: record['URL'] || record['url'] || undefined,
      postedAt: parseLinkedInDate(record['Posted Date'] || record['postedDate']),
      sourceFile,
    });
  }

  return jobs;
}

function normalizeActivities(
  records: Record<string, string>[],
  workspaceId: string,
  sourceFile: string,
  activityType: 'post' | 'comment' | 'reaction' | 'share' | 'repost' | 'vote'
): NormalizedActivity[] {
  const activities: NormalizedActivity[] = [];

  for (const record of records) {
    const content = record['Content'] || record['content'] || record['Text'] || '';
    const url = record['URL'] || record['url'] || record['Content URL'] || '';

    activities.push({
      workspaceId,
      activityType,
      content: content || undefined,
      contentUrl: url || undefined,
      createdAt: parseLinkedInDate(record['Date'] || record['date'] || record['Timestamp']),
      sourceFile,
    });
  }

  return activities;
}

export function normalizeData(
  parseResults: Map<string, CsvParseResult>,
  workspaceId: string
): NormalizationResult {
  const result: NormalizationResult = {
    persons: [],
    companies: [],
    connections: [],
    messages: [],
    activities: [],
    jobs: [],
    education: [],
    skills: [],
    insights: [],
    warnings: [],
    errors: [],
  };

  for (const [filename, parseResult] of parseResults) {
    try {
      if (parseResult.errors.length > 0) {
        result.errors.push(...parseResult.errors.map((e: string) => `${filename}: ${e}`));
      }

      const fileType = identifyFileType(filename);
      
      switch (fileType) {
        case 'Connections': {
          const { persons, connections } = normalizeConnections(
            parseResult.records, workspaceId, filename
          );
          result.persons.push(...persons);
          result.connections.push(...connections);
          break;
        }
        case 'Messages': {
          const messages = normalizeMessages(parseResult.records, workspaceId, filename);
          result.messages.push(...messages);
          break;
        }
        case 'Profile':
        case 'Profile Summary': {
          const { persons, companies } = normalizeProfile(
            parseResult.records, workspaceId, filename
          );
          result.persons.push(...persons);
          result.companies.push(...companies);
          break;
        }
        case 'Education': {
          const education = normalizeEducation(parseResult.records, workspaceId, filename);
          result.education.push(...education);
          break;
        }
        case 'Skills': {
          const skills = normalizeSkills(parseResult.records, workspaceId, filename);
          result.skills.push(...skills);
          break;
        }
        case 'Job Applications':
        case 'Saved Jobs': {
          const jobs = normalizeJobs(parseResult.records, workspaceId, filename);
          result.jobs.push(...jobs);
          break;
        }
        case 'Comments': {
          const activities = normalizeActivities(
            parseResult.records, workspaceId, filename, 'comment'
          );
          result.activities.push(...activities);
          break;
        }
        case 'Reactions': {
          const activities = normalizeActivities(
            parseResult.records, workspaceId, filename, 'reaction'
          );
          result.activities.push(...activities);
          break;
        }
        case 'Shares': {
          const activities = normalizeActivities(
            parseResult.records, workspaceId, filename, 'share'
          );
          result.activities.push(...activities);
          break;
        }
        case 'Reposts': {
          const activities = normalizeActivities(
            parseResult.records, workspaceId, filename, 'repost'
          );
          result.activities.push(...activities);
          break;
        }
        default:
          if (fileType !== 'Unknown') {
            result.warnings.push(`File type '${fileType}' recognized but not fully normalized`);
          }
          break;
      }
    } catch (err) {
      const error = err as Error;
      result.errors.push(`Error processing ${filename}: ${error.message}`);
    }
  }

  return result;
}

function identifyFileType(filename: string): string {
  if (/Connections\.csv$/i.test(filename)) return 'Connections';
  if (/messages\.csv$/i.test(filename)) return 'Messages';
  if (/Profile\.csv$/i.test(filename)) return 'Profile';
  if (/Profile\s*Summary\.csv$/i.test(filename)) return 'Profile Summary';
  if (/Education\.csv$/i.test(filename)) return 'Education';
  if (/Skills\.csv$/i.test(filename)) return 'Skills';
  if (/Job\s*Applications\.csv$/i.test(filename)) return 'Job Applications';
  if (/Saved\s*Jobs\.csv$/i.test(filename)) return 'Saved Jobs';
  if (/Comments\.csv$/i.test(filename)) return 'Comments';
  if (/Reactions\.csv$/i.test(filename)) return 'Reactions';
  if (/Shares\.csv$/i.test(filename)) return 'Shares';
  if (/Reposts\.csv$/i.test(filename)) return 'Reposts';
  if (/Positions\.csv$/i.test(filename)) return 'Positions';
  if (/Certifications\.csv$/i.test(filename)) return 'Certifications';
  if (/Projects\.csv$/i.test(filename)) return 'Projects';
  if (/Languages\.csv$/i.test(filename)) return 'Languages';
  if (/Honors.*Awards\.csv$/i.test(filename)) return 'Honors & Awards';
  if (/Volunteer.*Experience\.csv$/i.test(filename)) return 'Volunteer Experience';
  if (/Email.*Addresses\.csv$/i.test(filename)) return 'Email Addresses';
  if (/Phone.*Numbers\.csv$/i.test(filename)) return 'Phone Numbers';
  if (/Invitations\.csv$/i.test(filename)) return 'Invitations';
  if (/Notes\.csv$/i.test(filename)) return 'Notes';
  if (/Company.*Follows\.csv$/i.test(filename)) return 'Company Follows';
  if (/Hashtag.*Follows\.csv$/i.test(filename)) return 'Hashtag Follows';
  if (/Causes.*Care.*About\.csv$/i.test(filename)) return 'Causes';
  if (/Events\.csv$/i.test(filename)) return 'Events';
  if (/Ad.*Targeting\.csv$/i.test(filename)) return 'Ad Targeting';
  if (/Ad.*Clicks\.csv$/i.test(filename)) return 'Ad Clicks';
  if (/Registration\.csv$/i.test(filename)) return 'Registration';
  if (/Login.*History\.csv$/i.test(filename)) return 'Login History';
  if (/Security.*Challenges\.csv$/i.test(filename)) return 'Security Challenges';
  if (/Job.*Alerts\.csv$/i.test(filename)) return 'Job Alerts';
  return 'Unknown';
}
