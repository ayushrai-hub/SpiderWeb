import type { CsvParseResult } from '../csv-parser.js';
import { parseCsv } from '../csv-parser.js';

export interface LinkedInAdapter {
  fileType: string;
  pattern: RegExp;
  required: boolean;
  parse(filePath: string): CsvParseResult;
}

function createAdapter(
  fileType: string,
  pattern: RegExp,
  required: boolean,
  parser: (filePath: string) => CsvParseResult
): LinkedInAdapter {
  return { fileType, pattern, required, parse: parser };
}

// Identity
const profileAdapter = createAdapter(
  'Profile',
  /Profile\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const profileSummaryAdapter = createAdapter(
  'Profile Summary',
  /Profile\s*Summary\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const emailAddressesAdapter = createAdapter(
  'Email Addresses',
  /Email\s*Addresses\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const phoneNumbersAdapter = createAdapter(
  'Phone Numbers',
  /Phone\s*Numbers\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

// Career
const positionsAdapter = createAdapter(
  'Positions',
  /Positions\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const educationAdapter = createAdapter(
  'Education',
  /Education\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const skillsAdapter = createAdapter(
  'Skills',
  /Skills\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const certificationsAdapter = createAdapter(
  'Certifications',
  /Certifications\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const projectsAdapter = createAdapter(
  'Projects',
  /Projects\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const languagesAdapter = createAdapter(
  'Languages',
  /Languages\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const honorsAdapter = createAdapter(
  'Honors & Awards',
  /Honors\s*&?\s*Awards\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const volunteerExperienceAdapter = createAdapter(
  'Volunteer Experience',
  /Volunteer\s*Experience\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

// Network
const connectionsAdapter = createAdapter(
  'Connections',
  /Connections\.csv$/i,
  true,
  (fp) => parseCsv(fp)
);

const invitationsAdapter = createAdapter(
  'Invitations',
  /Invitations\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const notesAdapter = createAdapter(
  'Notes',
  /Notes\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

// Communication
const messagesAdapter = createAdapter(
  'Messages',
  /messages\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

// Activity
const commentsAdapter = createAdapter(
  'Comments',
  /Comments\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const reactionsAdapter = createAdapter(
  'Reactions',
  /Reactions\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const sharesAdapter = createAdapter(
  'Shares',
  /Shares\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const repostsAdapter = createAdapter(
  'Reposts',
  /Reposts\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

// Jobs
const jobApplicationsAdapter = createAdapter(
  'Job Applications',
  /Job\s*Applications\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const savedJobsAdapter = createAdapter(
  'Saved Jobs',
  /Saved\s*Jobs\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const jobAlertsAdapter = createAdapter(
  'Job Alerts',
  /Job\s*Alerts\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

// Interests
const companyFollowsAdapter = createAdapter(
  'Company Follows',
  /Company\s*Follows\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const hashtagFollowsAdapter = createAdapter(
  'Hashtag Follows',
  /Hashtag\s*Follows\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const causesFollowsAdapter = createAdapter(
  'Causes You Care About',
  /Causes.*Care.*About\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const eventsFollowsAdapter = createAdapter(
  'Events',
  /Events\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

// Platform data
const adTargetingAdapter = createAdapter(
  'Ad Targeting',
  /Ad\s*Targeting\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const adClicksAdapter = createAdapter(
  'Ad Clicks',
  /Ad\s*Clicks\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

// Account
const registrationAdapter = createAdapter(
  'Registration',
  /Registration\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const loginHistoryAdapter = createAdapter(
  'Login History',
  /Login\s*History\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

const securityChallengesAdapter = createAdapter(
  'Security Challenges',
  /Security\s*Challenges\.csv$/i,
  false,
  (fp) => parseCsv(fp)
);

// Grouping
const allAdapters: LinkedInAdapter[] = [
  profileAdapter,
  profileSummaryAdapter,
  emailAddressesAdapter,
  phoneNumbersAdapter,
  positionsAdapter,
  educationAdapter,
  skillsAdapter,
  certificationsAdapter,
  projectsAdapter,
  languagesAdapter,
  honorsAdapter,
  volunteerExperienceAdapter,
  connectionsAdapter,
  invitationsAdapter,
  notesAdapter,
  messagesAdapter,
  commentsAdapter,
  reactionsAdapter,
  sharesAdapter,
  repostsAdapter,
  jobApplicationsAdapter,
  savedJobsAdapter,
  jobAlertsAdapter,
  companyFollowsAdapter,
  hashtagFollowsAdapter,
  causesFollowsAdapter,
  eventsFollowsAdapter,
  adTargetingAdapter,
  adClicksAdapter,
  registrationAdapter,
  loginHistoryAdapter,
  securityChallengesAdapter,
];

export function getLinkedInAdapters(): LinkedInAdapter[] {
  return allAdapters;
}

export function matchAdapter(filename: string): LinkedInAdapter | undefined {
  return allAdapters.find((a) => a.pattern.test(filename));
}

export function identifyFileType(filename: string): string {
  const adapter = matchAdapter(filename);
  return adapter ? adapter.fileType : 'Unknown';
}
