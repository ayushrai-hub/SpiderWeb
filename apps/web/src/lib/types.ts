export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export type SignalKey =
  | "recent"
  | "long_standing"
  | "dormant"
  | "engaged"
  | "changed_company"
  | "shared_company"
  | "shared_school"
  | "no_company";

export interface Person {
  id: string;
  name: string;
  headline: string | null;
  currentCompany: string | null;
  currentTitle: string | null;
  location: string | null;
  industry: string | null;
  profileUrl: string | null;
  email: string | null;
  connectedAt: string | null;
  lastInteractionAt: string | null;
  interactionCount: number;
  signals: SignalKey[];
  tags: string[];
}

export interface PersonDetail extends Person {
  firstName: string | null;
  lastName: string | null;
  employment: {
    id: string;
    companyId: string | null;
    companyName: string | null;
    title: string | null;
    description: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
  }[];
  education: {
    id: string;
    schoolName: string | null;
    degree: string | null;
    fieldOfStudy: string | null;
    startDate: string | null;
    endDate: string | null;
  }[];
  skills: { id: string; name: string; endorsementCount: number }[];
  notes: { id: string; body: string; createdAt: string; updatedAt: string }[];
  conversations: { id: string; title: string | null; messageCount: number; lastMessageAt: string | null }[];
  interactions: { kind: string; occurredAt: string | null }[];
  sharedCompanies: string[];
  sharedSchools: string[];
  colleagueCount: number;
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface SignalFacet {
  key: SignalKey;
  label: string;
  kind: string;
  rule: string;
  count: number;
}

export interface Facets {
  companies: FacetValue[];
  locations: FacetValue[];
  industries: FacetValue[];
  titles: FacetValue[];
  schools: FacetValue[];
  tags: FacetValue[];
  signals: SignalFacet[];
}

export interface Dashboard {
  hasData: boolean;
  self: {
    name: string;
    headline: string | null;
    location: string | null;
    industry: string | null;
    profileUrl: string | null;
  } | null;
  totals: {
    connections: number;
    companies: number;
    currentCompanies: number;
    messages: number;
    conversations: number;
    schools: number;
    locations: number;
    industries: number;
    imports: number;
  };
  lastImportAt: string | null;
  growth: { month: string; added: number; cumulative: number }[];
  topCompanies: { id: string; name: string; total: number; current: number; former: number }[];
  topTitles: FacetValue[];
  topLocations: FacetValue[];
  topIndustries: FacetValue[];
  topSchools: FacetValue[];
  signals: SignalFacet[];
  recentConnections: {
    id: string;
    name: string;
    currentCompany: string | null;
    currentTitle: string | null;
    connectedAt: string;
  }[];
  careerMoves: {
    id: string;
    name: string;
    from: string;
    to: string;
    observedAt: string;
  }[];
  careerMoveCount: number;
  dataQuality: {
    withCompany: number;
    withTitle: number;
    withLocation: number;
    withEmail: number;
    withConnectionDate: number;
    total: number;
  };
}

export interface Company {
  id: string;
  name: string;
  industry: string | null;
  location: string | null;
  linkedinUrl: string | null;
  connectionCount: number;
  currentCount: number;
  formerCount: number;
}

export interface CompanyDetail extends Company {
  people: {
    id: string;
    name: string;
    title: string | null;
    isCurrent: boolean;
    location: string | null;
    profileUrl: string | null;
  }[];
  topTitles: FacetValue[];
  topLocations: FacetValue[];
  topSchools: FacetValue[];
  relatedCompanies: { id: string; name: string; sharedPeople: number }[];
  selfWorkedHere: boolean;
}

export interface ImportSummary {
  id: string;
  filename: string | null;
  status: "pending" | "processing" | "completed" | "partially_completed" | "failed" | "cancelled";
  uploadedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  fileCount: number;
  recordsDiscovered: number;
  recordsImported: number;
  recordsUpdated: number;
  recordsDuplicate: number;
  recordsRejected: number;
  warningCount: number;
  errorCount: number;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface ImportDetail extends ImportSummary {
  metadata: {
    stats: Record<string, number> | null;
    derived: Record<string, number> | null;
    warnings: string[];
  };
  files: {
    filename: string;
    dataset: string | null;
    status: "normalized" | "parsed" | "skipped" | "failed";
    reason: string | null;
    fileSize: number;
    recordsDiscovered: number;
    recordsImported: number;
    recordsRejected: number;
    warnings: string[];
    errors: string[];
  }[];
}

export interface GraphNode {
  id: string;
  type: "self" | "company" | "school" | "person" | "cluster";
  label: string;
  size: number;
  entityId?: string;
  meta?: Record<string, string | number | null>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "works_at" | "worked_at" | "studied_at" | "moved_to" | "in_cluster";
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  mode: "overview" | "company";
  kind?: "affiliation";
  caveat?: string;
  truncated: { hiddenCompanies: number; hiddenPeople: number };
}

export interface SearchHit {
  type: "person" | "company" | "conversation";
  id: string;
  title: string;
  subtitle: string | null;
  detail: string | null;
  score: number;
}

export interface Opportunity {
  personId: string;
  name: string;
  currentCompany: string | null;
  currentTitle: string | null;
  profileUrl: string | null;
  reasons: string[];
  connectedAt: string | null;
  lastInteractionAt: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  messageCount: number;
  startedAt: string | null;
  lastMessageAt: string | null;
  person: { id: string; name: string; currentCompany: string | null; profileUrl: string | null } | null;
}

export interface ConversationDetail extends Conversation {
  messages: {
    id: string;
    senderName: string | null;
    recipientName: string | null;
    subject: string | null;
    content: string;
    sentAt: string | null;
    direction: "inbound" | "outbound";
  }[];
}

export interface JobRow {
  id: string;
  title: string;
  companyName: string | null;
  companyId: string | null;
  connectionsAtCompany: number;
  location: string | null;
  url: string | null;
  appliedAt: string | null;
  savedAt: string | null;
}

export interface Me {
  user: { id: string; email: string; name: string | null };
  workspace: { id: string; name: string; slug: string | null; role: string; createdAt: string | null };
  onboarding: { hasConnections: boolean; hasImports: boolean; importInProgress: boolean };
}

export interface Coverage {
  known: number;
  unknown: number;
  total: number;
  coveragePercent: number;
}

export interface Share {
  numerator: number;
  denominator: number;
  ratio: number;
  percent: number;
}

export interface DistributionBin {
  key: string;
  label: string;
  count: number;
  shareOfKnown: Share;
  shareOfNetwork: Share;
  provenance: { trust: string; confidence: string; method: string; assumptions: string[] };
  drilldown: { metric: string; value: string };
}

export interface Distribution {
  dimension: string;
  coverage: Coverage;
  bins: DistributionBin[];
  unknownLabel: string;
}

export interface Concentration {
  hhi: number;
  entropy: number;
  normalizedEntropy: number;
  diversityBand: "high" | "moderate" | "low";
  topShare: Share;
  topN: number;
  coverage: Coverage;
  explanation: string;
  method: string;
}

export interface InsightCard {
  id: string;
  title: string;
  description: string;
  category: string;
  confidence: "high" | "medium" | "low";
  trust: "observed" | "derived" | "inferred";
  whyInteresting: string;
  evidence: string;
  calculation: { expression: string; numerator: number; denominator: number; percent?: number };
  coverage?: Coverage;
  timePeriod?: { from: string | null; to: string | null; label: string };
  assumptions: string[];
  affectedCount: number;
  drilldown: { metric: string; value?: string };
}

export interface AnalyticsReport {
  generatedAt: string;
  hasData: boolean;
  networkSize: number;
  self: {
    name: string;
    headline: string | null;
    location: string | null;
    industry: string | null;
    profileUrl: string | null;
    companyKeys?: string[];
    schools?: string[];
  } | null;
  limitations: string[];
  quality: {
    fields: { field: string; coverage: Coverage }[];
    duplicateUrlRate: number;
    peopleWithEmploymentHistory: number;
    peopleWithEducation: number;
    method: string;
  };
  growth: {
    coverage: Coverage;
    earliestDate: string | null;
    latestDate: string | null;
    series: { month: string; added: number; cumulative: number }[];
    last90Days: number;
    previous90Days: number;
    acceleration: string;
    unusualMonths: { month: string; added: number; zScore: number }[];
    method: string;
  };
  recency: {
    coverage: Coverage;
    buckets: { key: string; label: string; count: number; shareOfKnown: Share; shareOfNetwork: Share }[];
    method: string;
    caveat: string;
  };
  composition: {
    currentCompanies: Distribution;
    formerCompanies: Distribution;
    titles: Distribution;
    roleFamilies: Distribution;
    seniority: Distribution;
    industries: Distribution;
    locations: Distribution;
    countries: Distribution;
    cities: Distribution;
    schools: Distribution;
  };
  concentration: {
    companies: Concentration;
    industries: Concentration;
    countries: Concentration;
    roleFamilies: Concentration;
  };
  diversity: {
    companies: Concentration["diversityBand"];
    industries: Concentration["diversityBand"];
    geography: Concentration["diversityBand"];
    roles: Concentration["diversityBand"];
  };
  career: {
    moves: {
      personId: string;
      name: string;
      fromCompany: string;
      toCompany: string;
      fromTitle: string | null;
      toTitle: string | null;
      observedAt: string | null;
      evidence: string;
    }[];
    flows: {
      fromKey: string;
      fromLabel: string;
      toKey: string;
      toLabel: string;
      count: number;
      personIds: string[];
    }[];
    peopleWithMultipleEmployers: number;
    method: string;
    limitations: string[];
  };
  roleTransitions: { fromFamily: string; toFamily: string; count: number }[];
  industryTransitions: { fromFamily: string; toFamily: string; count: number }[];
  changes: {
    comparedImports: {
      previous: { id: string; uploadedAt: string; filename?: string | null } | null;
      current: { id: string; uploadedAt: string; filename?: string | null } | null;
    };
    newConnections: { personId: string; name: string }[];
    notSeenInLatestConnectionsImport: { personId: string; name: string }[];
    companyChanges: { personId: string; name: string; field: string; from: string; to: string }[];
    titleChanges: { personId: string; name: string; field: string; from: string; to: string }[];
    limitations: string[];
    method: string;
  };
  insights: InsightCard[];
  reconnectionCandidates: {
    personId: string;
    name: string;
    currentCompany: string | null;
    currentTitle: string | null;
    reasons: string[];
    contextScore: number;
  }[];
  graphCaveat: string;
}

export interface AnalystAnswer {
  intent: { type: string; [key: string]: unknown };
  answer: string;
  records: { personId?: string; name?: string; detail?: string }[];
  confidence: "high" | "medium" | "low";
  limitations: string[];
}

export interface RelevanceBreakdown {
  personId: string;
  score: number;
  contributions: { key: string; label: string; points: number; evidence: string }[];
  disclaimer: string;
}

export interface AnalyticsRecord {
  id: string;
  name: string;
  currentCompany: string | null;
  currentTitle: string | null;
  location: string | null;
  profileUrl: string | null;
  connectedAt: string | null;
}
