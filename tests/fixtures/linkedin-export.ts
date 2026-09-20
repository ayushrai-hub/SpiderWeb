import { zipSync, strToU8 } from 'fflate';

/**
 * Synthetic LinkedIn archives that mirror the real export format, including
 * the parts that break naive parsers:
 *   - the free-text "Notes:" preamble Connections.csv ships with
 *   - quoted fields containing commas, newlines and doubled quotes
 *   - blank rows, short rows and rows with extra columns
 *   - the mixed date formats LinkedIn emits ("15 Mar 2022", "2024-01-05", "Mar 2020")
 *   - UTF-8 names outside ASCII
 */

export const CONNECTIONS_PREAMBLE = [
  'Notes:',
  '"When exporting your connection data, you may notice that some of the email addresses are missing. You will only see email addresses for connections who have allowed their connections to see or download their email address using this setting https://www.linkedin.com/psettings/privacy/email. You can learn more here https://www.linkedin.com/help/linkedin/answer/261."',
  '',
].join('\n');

export interface ConnectionFixture {
  firstName: string;
  lastName: string;
  url: string;
  email: string;
  company: string;
  position: string;
  connectedOn: string;
}

export const CONNECTIONS_V1: ConnectionFixture[] = [
  {
    firstName: 'Jane',
    lastName: 'Smith',
    url: 'https://www.linkedin.com/in/janesmith',
    email: 'jane.smith@example.com',
    company: 'Acme Corp',
    position: 'Senior Engineer',
    connectedOn: '01 Jan 2023',
  },
  {
    firstName: 'Bob',
    lastName: 'Johnson',
    url: 'https://www.linkedin.com/in/bobjohnson',
    email: '',
    company: 'TechStart, Inc.',
    position: 'Product Manager',
    connectedOn: '15 Mar 2022',
  },
  {
    firstName: 'Alice',
    lastName: 'Williams',
    url: 'https://www.linkedin.com/in/alicewilliams',
    email: 'alice.w@design.co',
    company: 'Creative Labs',
    position: 'UX Designer',
    connectedOn: '20 Jun 2023',
  },
  {
    firstName: 'Charlie',
    lastName: 'Brown',
    url: 'https://www.linkedin.com/in/charliebrown',
    email: '',
    company: 'DataFlow Inc',
    position: 'Data Analyst',
    connectedOn: '05 Nov 2016',
  },
  {
    firstName: 'Diana',
    lastName: 'Lee',
    url: 'https://www.linkedin.com/in/dianalee',
    email: 'diana.l@cloud.net',
    company: 'CloudScale',
    position: 'DevOps Engineer',
    connectedOn: '10 Feb 2024',
  },
  {
    firstName: 'Eve',
    lastName: 'Martinez',
    url: 'https://www.linkedin.com/in/evemartinez',
    email: '',
    company: 'AppVenture',
    position: 'CEO',
    connectedOn: '01 Aug 2022',
  },
  {
    firstName: 'Frank',
    lastName: 'Chen',
    url: 'https://www.linkedin.com/in/frankchen',
    email: 'frank.c@bigtech.com',
    company: 'Acme Corporation',
    position: 'Staff Engineer',
    connectedOn: '25 Dec 2015',
  },
  {
    firstName: 'Grace',
    lastName: 'Okonkwo',
    url: 'https://www.linkedin.com/in/graceokonkwo',
    email: '',
    company: 'Acme Corp',
    position: 'Engineering Manager',
    connectedOn: '14 Jul 2021',
  },
  {
    firstName: 'Hiroshi',
    lastName: 'Tanaka',
    url: 'https://www.linkedin.com/in/hiroshitanaka',
    email: '',
    company: 'Nippon Systems K.K.',
    position: 'Principal Architect',
    connectedOn: '03 Sep 2019',
  },
  {
    firstName: 'Íñigo',
    lastName: 'Montoya',
    url: 'https://www.linkedin.com/in/inigomontoya',
    email: 'inigo@fencing.es',
    company: 'Florin Security',
    position: 'Head of Security',
    connectedOn: '22 Apr 2020',
  },
  // No profile URL and no email: identity must fall back to name + company.
  {
    firstName: 'Priya',
    lastName: 'Nair',
    url: '',
    email: '',
    company: 'Globex',
    position: 'Director of Data',
    connectedOn: '30 May 2018',
  },
  // Same person exported twice — must collapse to one connection.
  {
    firstName: 'Jane',
    lastName: 'Smith',
    url: 'https://www.linkedin.com/in/janesmith?trk=contacts',
    email: 'jane.smith@example.com',
    company: 'Acme Corp',
    position: 'Senior Engineer',
    connectedOn: '01 Jan 2023',
  },
];

/** Second export: Jane changed jobs, Bob got promoted, two new people joined. */
export const CONNECTIONS_V2: ConnectionFixture[] = [
  {
    firstName: 'Jane',
    lastName: 'Smith',
    url: 'https://www.linkedin.com/in/janesmith',
    email: 'jane.smith@example.com',
    company: 'Globex',
    position: 'Principal Engineer',
    connectedOn: '01 Jan 2023',
  },
  {
    firstName: 'Bob',
    lastName: 'Johnson',
    url: 'https://www.linkedin.com/in/bobjohnson',
    email: '',
    company: 'TechStart, Inc.',
    position: 'Director of Product',
    connectedOn: '15 Mar 2022',
  },
  ...CONNECTIONS_V1.slice(2, 11),
  {
    firstName: 'Noor',
    lastName: 'Haddad',
    url: 'https://www.linkedin.com/in/noorhaddad',
    email: '',
    company: 'Globex',
    position: 'Security Engineer',
    connectedOn: '02 Feb 2026',
  },
  {
    firstName: 'Tom',
    lastName: 'Riley',
    url: 'https://www.linkedin.com/in/tomriley',
    email: '',
    company: 'Acme Corp',
    position: 'Recruiter',
    connectedOn: '20 Jan 2026',
  },
];

function csv(rows: string[][]): string {
  return rows.map((r) => r.map(quote).join(',')).join('\n') + '\n';
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function connectionsCsv(rows: ConnectionFixture[], { preamble = true } = {}): string {
  const body = csv([
    ['First Name', 'Last Name', 'URL', 'Email Address', 'Company', 'Position', 'Connected On'],
    ...rows.map((r) => [r.firstName, r.lastName, r.url, r.email, r.company, r.position, r.connectedOn]),
  ]);
  return preamble ? `${CONNECTIONS_PREAMBLE}\n${body}` : body;
}

export const PROFILE_CSV = csv([
  [
    'First Name',
    'Last Name',
    'Maiden Name',
    'Address',
    'Birth Date',
    'Headline',
    'Summary',
    'Industry',
    'Zip Code',
    'Geo Location',
    'Twitter Handles',
    'Websites',
    'Instant Messengers',
  ],
  [
    'Alex',
    'Rivera',
    '',
    '',
    '',
    'Engineering leader, ex-Acme',
    'Builds platform teams.\nLikes long CSVs.',
    'Software Development',
    '',
    'San Francisco Bay Area',
    '@alexrivera',
    'https://alexrivera.dev',
    '',
  ],
]);

export const POSITIONS_CSV = csv([
  ['Company Name', 'Title', 'Description', 'Location', 'Started On', 'Finished On'],
  [
    'Globex',
    'VP Engineering',
    'Leads platform, "infra" and data teams.',
    'San Francisco, CA',
    'Feb 2023',
    '',
  ],
  [
    'Acme Corp',
    'Director of Engineering',
    'Grew the team from 8 to 40.',
    'San Francisco, CA',
    'Mar 2019',
    'Jan 2023',
  ],
  ['DataFlow Inc', 'Senior Engineer', '', 'Remote', 'Jun 2015', 'Feb 2019'],
]);

export const EDUCATION_CSV = csv([
  ['School Name', 'Start Date', 'End Date', 'Notes', 'Degree Name', 'Activities'],
  ['Stanford University', '2011', '2015', '', 'BS, Computer Science', 'ACM'],
  ['Berkeley Extension', '2018', '2019', '', 'Certificate, Systems Design', ''],
]);

export const SKILLS_CSV = csv([
  ['Name'],
  ['Distributed Systems'],
  ['Go'],
  ['PostgreSQL'],
  ['Team Leadership'],
]);

export const EMAILS_CSV = csv([
  ['Email Address', 'Confirmed', 'Primary', 'Updated On'],
  ['alex@rivera.dev', 'Yes', 'Yes', '2024-01-05'],
  ['alex.rivera@globex.com', 'Yes', 'No', '2024-06-11'],
]);

export const PHONES_CSV = csv([
  ['Extension', 'Number', 'Type'],
  ['', '+1 415 555 0101', 'mobile'],
]);

export const MESSAGES_CSV = csv([
  [
    'CONVERSATION ID',
    'CONVERSATION TITLE',
    'FROM',
    'SENDER PROFILE URL',
    'TO',
    'RECIPIENT PROFILE URLS',
    'DATE',
    'SUBJECT',
    'CONTENT',
    'FOLDER',
  ],
  [
    'c-1001',
    '',
    'Jane Smith',
    'https://www.linkedin.com/in/janesmith',
    'Alex Rivera',
    'https://www.linkedin.com/in/alexrivera',
    '2025-11-02 09:14:03 UTC',
    '',
    'Hi Alex — are you hiring for platform roles?',
    'INBOX',
  ],
  [
    'c-1001',
    '',
    'Alex Rivera',
    'https://www.linkedin.com/in/alexrivera',
    'Jane Smith',
    'https://www.linkedin.com/in/janesmith',
    '2025-11-02 17:40:55 UTC',
    '',
    'We are. Let’s talk Thursday.',
    'SENT',
  ],
  [
    'c-1002',
    'Intro',
    'Grace Okonkwo',
    'https://www.linkedin.com/in/graceokonkwo',
    'Alex Rivera',
    'https://www.linkedin.com/in/alexrivera',
    '2019-04-18 11:00:00 UTC',
    'Intro',
    'Great to meet you at the conference,\nlet’s stay in touch.',
    'INBOX',
  ],
]);

export const INVITATIONS_CSV = csv([
  ['From', 'To', 'Sent At', 'Message', 'Direction', 'inviterProfileUrl', 'inviteeProfileUrl'],
  [
    'Alex Rivera',
    'Noor Haddad',
    '2026-01-28 10:00:00 UTC',
    'Would love to connect.',
    'OUTGOING',
    'https://www.linkedin.com/in/alexrivera',
    'https://www.linkedin.com/in/noorhaddad',
  ],
]);

export const ENDORSEMENTS_CSV = csv([
  [
    'Endorsement Date',
    'Skill Name',
    'Endorser First Name',
    'Endorser Last Name',
    'Endorser Public Url',
    'Endorsement Status',
  ],
  [
    '2024-03-11 08:00:00 UTC',
    'Distributed Systems',
    'Frank',
    'Chen',
    'https://www.linkedin.com/in/frankchen',
    'ACCEPTED',
  ],
  ['2023-09-02 08:00:00 UTC', 'Go', 'Jane', 'Smith', 'https://www.linkedin.com/in/janesmith', 'ACCEPTED'],
]);

export const RECOMMENDATIONS_CSV = csv([
  ['First Name', 'Last Name', 'Company', 'Job Title', 'Text', 'Creation Date', 'Status'],
  [
    'Grace',
    'Okonkwo',
    'Acme Corp',
    'Engineering Manager',
    'Alex is a rare, "systems-first" leader.',
    '2022-05-04',
    'VISIBLE',
  ],
]);

export const COMPANY_FOLLOWS_CSV = csv([
  ['Organization', 'Followed On'],
  ['Globex', '2023-02-01 00:00:00 UTC'],
  ['Creative Labs', '2021-11-19 00:00:00 UTC'],
]);

export const JOB_APPLICATIONS_CSV = csv([
  [
    'Application Date',
    'Contact Email',
    'Contact Phone Number',
    'Company Name',
    'Job Title',
    'Job Url',
    'Resume Name',
    'Question And Answers',
  ],
  [
    '2/14/26',
    '',
    '',
    'Globex',
    'VP Platform',
    'https://www.linkedin.com/jobs/view/1234567890',
    'resume.pdf',
    '',
  ],
]);

export const SAVED_JOBS_CSV = csv([
  ['Saved Date', 'Job Url', 'Job Title', 'Company Name'],
  [
    '2026-02-10 00:00:00 UTC',
    'https://www.linkedin.com/jobs/view/222',
    'Head of Infrastructure',
    'Creative Labs',
  ],
]);

export const REACTIONS_CSV = csv([
  ['Date', 'Type', 'Link'],
  ['2025-12-01 08:00:00 UTC', 'LIKE', 'https://www.linkedin.com/feed/update/urn:li:activity:1'],
  ['2025-12-04 08:00:00 UTC', 'PRAISE', 'https://www.linkedin.com/feed/update/urn:li:activity:2'],
]);

export const COMMENTS_CSV = csv([
  ['Date', 'Link', 'Message'],
  [
    '2025-12-02 08:00:00 UTC',
    'https://www.linkedin.com/feed/update/urn:li:activity:1',
    'Strong write-up, thanks for sharing.',
  ],
]);

/** Rows that must be rejected individually without failing the file. */
export const MALFORMED_CONNECTIONS_CSV =
  `${CONNECTIONS_PREAMBLE}\n` +
  '"First Name","Last Name","URL","Email Address","Company","Position","Connected On"\n' +
  '"Valid","Person","https://www.linkedin.com/in/validperson","v@example.com","Acme Corp","Engineer","01 Jan 2023"\n' +
  '"","","","","","",""\n' + // entirely blank -> rejected
  '"Short","Row"\n' + // missing columns -> still usable
  '"Extra","Columns","https://www.linkedin.com/in/extra","e@example.com","Acme Corp","Engineer","01 Jan 2023","surplus"\n' +
  '"Unterminated,"Quote","https://www.linkedin.com/in/uq","u@example.com","Acme","Eng","bogus-date"\n' +
  '\n' +
  '"Last","Valid","https://www.linkedin.com/in/lastvalid","l@example.com","Globex","Analyst","2024-05-05"\n';

export const ADS_CSV = csv([
  ['Date', 'Ad Title'],
  ['2025-01-01', 'Buy things'],
]);

export interface ArchiveOptions {
  /** Prefix every entry with the folder LinkedIn wraps archives in. */
  folder?: string;
  connections?: ConnectionFixture[];
  includeProfile?: boolean;
  includeMessages?: boolean;
  extraFiles?: Record<string, string | Uint8Array>;
  omit?: string[];
}

/** Build an in-memory ZIP that looks like a real LinkedIn archive. */
export function buildArchive(options: ArchiveOptions = {}): Uint8Array {
  const folder = options.folder ?? 'Complete_LinkedInDataExport_2026-02-20';
  const files: Record<string, string | Uint8Array> = {
    'Connections.csv': connectionsCsv(options.connections ?? CONNECTIONS_V1),
    'Positions.csv': POSITIONS_CSV,
    'Education.csv': EDUCATION_CSV,
    'Skills.csv': SKILLS_CSV,
    'Email Addresses.csv': EMAILS_CSV,
    'PhoneNumbers.csv': PHONES_CSV,
    'Invitations.csv': INVITATIONS_CSV,
    'Endorsement_Received_Info.csv': ENDORSEMENTS_CSV,
    'Recommendations_Received.csv': RECOMMENDATIONS_CSV,
    'Company Follows.csv': COMPANY_FOLLOWS_CSV,
    'Reactions.csv': REACTIONS_CSV,
    'Comments.csv': COMMENTS_CSV,
    'jobs/Job Applications.csv': JOB_APPLICATIONS_CSV,
    'jobs/Saved Jobs.csv': SAVED_JOBS_CSV,
    // Recognised but deliberately not imported.
    'Ads Clicked.csv': ADS_CSV,
    // Junk that must be ignored without complaint.
    '__MACOSX/._Connections.csv': 'garbage',
    '.DS_Store': 'garbage',
    'Rich Media.csv': csv([
      ['Type', 'Link'],
      ['PHOTO', 'https://example.com/p.jpg'],
    ]),
  };
  if (options.includeProfile !== false) files['Profile.csv'] = PROFILE_CSV;
  if (options.includeMessages !== false) files['messages.csv'] = MESSAGES_CSV;
  for (const name of options.omit ?? []) delete files[name];
  Object.assign(files, options.extraFiles ?? {});

  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    entries[folder ? `${folder}/${name}` : name] = typeof content === 'string' ? strToU8(content) : content;
  }
  return zipSync(entries, { level: 6 });
}

/** A ZIP whose entries try to escape the extraction directory. */
export function buildMaliciousArchive(): Uint8Array {
  return zipSync({
    '../../../../tmp/spiderweb-pwned.txt': strToU8('should never be written'),
    '/etc/spiderweb-pwned.txt': strToU8('should never be written'),
    'Connections.csv': strToU8(connectionsCsv(CONNECTIONS_V1.slice(0, 2))),
  });
}

/** A ZIP containing only files SpiderWeb does not import. */
export function buildIrrelevantArchive(): Uint8Array {
  return zipSync({
    'Ads Clicked.csv': strToU8(ADS_CSV),
    'holiday-photo.jpg': new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
  });
}

/** Generate a large connection list for performance checks. */
export function largeConnections(count: number): ConnectionFixture[] {
  const companies = ['Acme Corp', 'Globex', 'Initech', 'Umbrella Health', 'Stark Industries', 'Wayne Labs'];
  const titles = [
    'Software Engineer',
    'Product Manager',
    'Data Scientist',
    'Designer',
    'Engineering Manager',
  ];
  const out: ConnectionFixture[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      firstName: `Person${i}`,
      lastName: `Sample${i % 97}`,
      url: `https://www.linkedin.com/in/person-${i}`,
      email: i % 3 === 0 ? `person${i}@example.com` : '',
      company: companies[i % companies.length],
      position: titles[i % titles.length],
      connectedOn: `${String((i % 28) + 1).padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'][i % 6]} ${2015 + (i % 11)}`,
    });
  }
  return out;
}
