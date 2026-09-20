/**
 * Shared types for the deterministic analytics engine.
 *
 * Trust levels:
 *   observed  — present in the LinkedIn export
 *   derived   — calculated from observed rows by a stated formula
 *   inferred  — classified or concluded from multiple signals; never a fact
 */

export type TrustLevel = 'observed' | 'derived' | 'inferred';
export type Confidence = 'high' | 'medium' | 'low';
export type DiversityBand = 'high' | 'moderate' | 'low';

export interface Coverage {
  known: number;
  unknown: number;
  total: number;
  /** known / total * 100, 0 when total is 0. */
  coveragePercent: number;
}

export interface Share {
  numerator: number;
  denominator: number;
  ratio: number;
  /** One decimal place. */
  percent: number;
}

export interface MetricProvenance {
  trust: TrustLevel;
  confidence: Confidence;
  method: string;
  assumptions: string[];
}

export interface DistributionBin {
  key: string;
  label: string;
  count: number;
  /** Share of classified (known) records. */
  shareOfKnown: Share;
  /** Share of the whole network, including unknowns. */
  shareOfNetwork: Share;
  provenance: MetricProvenance;
  drilldown: { metric: string; value: string };
}

export interface Distribution {
  dimension: string;
  coverage: Coverage;
  bins: DistributionBin[];
  unknownLabel: string;
}

export interface Concentration {
  /** Herfindahl-Hirschman Index on classified shares, 0–1 scale. */
  hhi: number;
  /** Shannon entropy of classified shares, nats. */
  entropy: number;
  /** Entropy / ln(n categories), 0–1. */
  normalizedEntropy: number;
  diversityBand: DiversityBand;
  topShare: Share;
  topN: number;
  coverage: Coverage;
  explanation: string;
  method: string;
}

export interface PersonFact {
  id: string;
  name: string;
  currentCompany?: string | null;
  currentCompanyKey?: string | null;
  currentCompanyId?: string | null;
  currentTitle?: string | null;
  location?: string | null;
  /** Industry string as exported by LinkedIn, if any. */
  observedIndustry?: string | null;
  profileUrl?: string | null;
  email?: string | null;
  connectedAt?: Date | string | null;
  lastInteractionAt?: Date | string | null;
  interactionCount: number;
  firstImportId?: string | null;
  lastImportId?: string | null;
}

export interface EmploymentFact {
  personId: string;
  companyId?: string | null;
  companyName?: string | null;
  companyKey?: string | null;
  title?: string | null;
  isCurrent: boolean;
  startDate?: string | null;
  endDate?: string | null;
  startedOn?: string | null;
  endedOn?: string | null;
  observedAt?: Date | string | null;
}

export interface EducationFact {
  personId: string;
  schoolName?: string | null;
}

export interface CompanyFact {
  id: string;
  name: string;
  normalizedName: string;
  industry?: string | null;
  currentCount: number;
  formerCount: number;
  connectionCount: number;
}

export interface ImportFact {
  id: string;
  uploadedAt: Date | string;
  status: string;
  hadConnections: boolean;
  filename?: string | null;
}

export interface SelfFact {
  personId: string;
  name: string;
  headline?: string | null;
  location?: string | null;
  industry?: string | null;
  profileUrl?: string | null;
  companyKeys: string[];
  schools: string[];
}

export interface NetworkFacts {
  people: PersonFact[];
  employment: EmploymentFact[];
  education: EducationFact[];
  companies: CompanyFact[];
  imports: ImportFact[];
  self: SelfFact | null;
}

export interface Insight {
  id: string;
  title: string;
  description: string;
  category:
    'composition' | 'concentration' | 'growth' | 'career' | 'quality' | 'change' | 'gap' | 'relationship';
  confidence: Confidence;
  trust: TrustLevel;
  whyInteresting: string;
  evidence: string;
  calculation: {
    expression: string;
    numerator: number;
    denominator: number;
    percent?: number;
  };
  coverage?: Coverage;
  timePeriod?: { from: string | null; to: string | null; label: string };
  assumptions: string[];
  affectedCount: number;
  drilldown: { metric: string; value?: string };
}

export interface RecencyBucket {
  key: string;
  label: string;
  maxDays: number;
}

export interface RecencyBin {
  key: string;
  label: string;
  count: number;
  shareOfKnown: Share;
  shareOfNetwork: Share;
}

export const DEFAULT_RECENCY_BUCKETS: RecencyBucket[] = [
  { key: '3m', label: '< 3 months', maxDays: 90 },
  { key: '6m', label: '3–6 months', maxDays: 180 },
  { key: '12m', label: '6–12 months', maxDays: 365 },
  { key: '2y', label: '1–2 years', maxDays: 730 },
  { key: '5y', label: '2–5 years', maxDays: 1825 },
  { key: '5y_plus', label: '5+ years', maxDays: Number.POSITIVE_INFINITY },
];

/** Normalized Shannon entropy cutoffs. Configurable, not arbitrary product scores. */
export const DIVERSITY_THRESHOLDS = { high: 0.75, moderate: 0.45 } as const;

/** HHI (0–1) cutoffs. 0.25 ≡ 2,500 on the 0–10,000 census scale. */
export const CONCENTRATION_THRESHOLDS = { high: 0.25, moderate: 0.15 } as const;
