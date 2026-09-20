export { DIVERSITY_THRESHOLDS, CONCENTRATION_THRESHOLDS, DEFAULT_RECENCY_BUCKETS } from './types.js';
export type {
  TrustLevel,
  Confidence,
  DiversityBand,
  Coverage,
  Share,
  MetricProvenance,
  DistributionBin,
  Distribution,
  Concentration,
  PersonFact,
  EmploymentFact,
  EducationFact,
  CompanyFact,
  ImportFact,
  SelfFact,
  NetworkFacts,
  Insight,
  RecencyBucket,
  RecencyBin,
} from './types.js';

export {
  round1,
  coverage,
  share,
  herfindahl,
  shannonEntropy,
  normalizedEntropy,
  diversityBand,
  concentrationFromCounts,
} from './stats.js';

export {
  classifyIndustry,
  classifyRoleFamily,
  classifySeniority,
  parseLocation,
  INDUSTRIES,
  ROLE_FAMILIES,
  SENIORITY,
} from './classify.js';
export type { Classification, GeoParts } from './classify.js';

export {
  companyDistribution,
  titleDistribution,
  roleFamilyDistribution,
  seniorityDistribution,
  industryDistribution,
  locationDistribution,
  educationDistribution,
  concentrationOf,
  underrepresented,
} from './composition.js';

export { calculateNetworkGrowth } from './growth.js';
export type { GrowthAnalysis, GrowthPoint } from './growth.js';

export { calculateRelationshipRecency } from './recency.js';
export type { RecencyAnalysis } from './recency.js';

export { calculateCareerMobility, roleTransitions, industryTransitions } from './career.js';
export type { CareerAnalysis, CareerMove, CareerFlow, RoleShift } from './career.js';

export { relationshipContextScore, findOpportunities, reconnectionCandidates } from './relevance.js';
export type {
  RelevanceBreakdown,
  SignalContribution,
  OpportunityMatch,
  OpportunityQuery,
} from './relevance.js';

export { calculateDataQuality } from './quality.js';
export type { DataQuality, FieldCoverage } from './quality.js';

export { detectChanges, employmentChanges } from './changes.js';
export type { ChangeReport, FieldChange } from './changes.js';

export { generateInsights, coverageNote } from './insights.js';

export { parseQuestion, answerQuestion } from './query.js';
export type { AnalystIntent, AnalystAnswer } from './query.js';

export { buildAnalyticsReport, contextForPerson, recordsForMetric, GRAPH_CAVEAT } from './report.js';
export type { AnalyticsReport, BuildOptions } from './report.js';
