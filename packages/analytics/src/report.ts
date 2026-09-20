import { classifyIndustry, classifyRoleFamily, classifySeniority } from './classify.js';
import {
  companyDistribution,
  concentrationOf,
  educationDistribution,
  industryDistribution,
  locationDistribution,
  roleFamilyDistribution,
  seniorityDistribution,
  titleDistribution,
} from './composition.js';
import { calculateCareerMobility, industryTransitions, roleTransitions } from './career.js';
import { detectChanges, employmentChanges } from './changes.js';
import { calculateNetworkGrowth } from './growth.js';
import { generateInsights } from './insights.js';
import { calculateDataQuality } from './quality.js';
import { calculateRelationshipRecency } from './recency.js';
import { reconnectionCandidates, relationshipContextScore } from './relevance.js';
import type {
  Concentration,
  Distribution,
  Insight,
  NetworkFacts,
  PersonFact,
  RecencyBucket,
  SelfFact,
} from './types.js';
import type { CareerAnalysis } from './career.js';
import type { ChangeReport } from './changes.js';
import type { GrowthAnalysis } from './growth.js';
import type { DataQuality } from './quality.js';
import type { RecencyAnalysis } from './recency.js';
import type { OpportunityMatch, RelevanceBreakdown } from './relevance.js';

export interface AnalyticsReport {
  generatedAt: string;
  hasData: boolean;
  networkSize: number;
  self: SelfFact | null;
  limitations: string[];
  quality: DataQuality;
  growth: GrowthAnalysis;
  recency: RecencyAnalysis;
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
    companies: Concentration['diversityBand'];
    industries: Concentration['diversityBand'];
    geography: Concentration['diversityBand'];
    roles: Concentration['diversityBand'];
  };
  career: CareerAnalysis;
  roleTransitions: ReturnType<typeof roleTransitions>;
  industryTransitions: ReturnType<typeof industryTransitions>;
  changes: ChangeReport;
  insights: Insight[];
  reconnectionCandidates: OpportunityMatch[];
  graphCaveat: string;
}

export interface BuildOptions {
  now?: Date;
  recencyBuckets?: RecencyBucket[];
}

export const GRAPH_CAVEAT =
  'LinkedIn export data does not include who-knows-whom among your connections. The graph is an affiliation graph (you → company/school → people), not a social graph of personal relationships. Sharing a company is not evidence that two people know each other.';

export function buildAnalyticsReport(facts: NetworkFacts, options: BuildOptions = {}): AnalyticsReport {
  const now = options.now ?? new Date();
  const people = facts.people;
  const limitations: string[] = [
    GRAPH_CAVEAT,
    'Connection age is not relationship strength.',
    'Industry and role family are inferred when LinkedIn did not export those fields.',
  ];

  const quality = calculateDataQuality(people, facts.employment, facts.education);
  const growth = calculateNetworkGrowth(people, now);
  const recency = calculateRelationshipRecency(people, now, options.recencyBuckets);
  const currentCompanies = companyDistribution(people, facts.companies, 'current', facts.employment);
  const formerCompanies = companyDistribution(people, facts.companies, 'former', facts.employment);
  const titles = titleDistribution(people);
  const roleFamilies = roleFamilyDistribution(people);
  const seniority = seniorityDistribution(people);
  const industries = industryDistribution(people);
  const locations = locationDistribution(people, 'raw');
  const countries = locationDistribution(people, 'country');
  const cities = locationDistribution(people, 'city');
  const schools = educationDistribution(people, facts.education);
  const career = calculateCareerMobility(people, facts.employment);

  const empChanges = employmentChanges(people, career.moves);
  const changes: ChangeReport = {
    ...detectChanges(
      people,
      facts.imports,
      facts.companies.map((c) => ({
        key: c.normalizedName,
        name: c.name,
        currentCount: c.currentCount,
      }))
    ),
    companyChanges: empChanges.companyChanges,
    titleChanges: empChanges.titleChanges,
  };

  const companyConc = concentrationOf(currentCompanies);
  const industryConc = concentrationOf(industries);
  const geoConc = concentrationOf(countries.coverage.known > 0 ? countries : locations);
  const roleConc = concentrationOf(roleFamilies);

  const insights = generateInsights({
    networkSize: people.length,
    companies: currentCompanies,
    companyConcentration: companyConc,
    industries,
    industryConcentration: industryConc,
    geography: countries,
    roles: roleFamilies,
    growth,
    career,
    quality,
    changes,
  });

  return {
    generatedAt: now.toISOString(),
    hasData: people.length > 0,
    networkSize: people.length,
    self: facts.self,
    limitations,
    quality,
    growth,
    recency,
    composition: {
      currentCompanies,
      formerCompanies,
      titles,
      roleFamilies,
      seniority,
      industries,
      locations,
      countries,
      cities,
      schools,
    },
    concentration: {
      companies: companyConc,
      industries: industryConc,
      countries: geoConc,
      roleFamilies: roleConc,
    },
    diversity: {
      companies: companyConc.diversityBand,
      industries: industryConc.diversityBand,
      geography: geoConc.diversityBand,
      roles: roleConc.diversityBand,
    },
    career,
    roleTransitions: roleTransitions(career.moves),
    industryTransitions: industryTransitions(people, career.moves),
    changes,
    insights,
    reconnectionCandidates: reconnectionCandidates(
      people,
      facts.employment,
      facts.education,
      facts.self,
      now
    ),
    graphCaveat: GRAPH_CAVEAT,
  };
}

export function contextForPerson(
  facts: NetworkFacts,
  personId: string,
  now = new Date()
): RelevanceBreakdown | null {
  const person = facts.people.find((p) => p.id === personId);
  if (!person) return null;
  return relationshipContextScore(person, facts.employment, facts.education, facts.self, now);
}

export function recordsForMetric(facts: NetworkFacts, metric: string, value?: string): PersonFact[] {
  const { people, employment, education } = facts;
  const v = (value ?? '').trim().toLowerCase();

  switch (metric) {
    case 'company':
      return people.filter(
        (p) => (p.currentCompanyKey || k(p.currentCompany)) === v || k(p.currentCompany) === v
      );
    case 'former_company':
      return people.filter((p) =>
        employment.some(
          (e) => e.personId === p.id && !e.isCurrent && (e.companyKey || k(e.companyName)) === v
        )
      );
    case 'title':
      return people.filter((p) => k(p.currentTitle) === v);
    case 'role_family':
      return people.filter((p) => classifyRoleFamily(p.currentTitle)?.key === v);
    case 'seniority':
      return people.filter((p) => classifySeniority(p.currentTitle)?.key === v);
    case 'industry':
      return people.filter((p) => {
        const cls = classifyIndustry({
          observedIndustry: p.observedIndustry,
          title: p.currentTitle,
          company: p.currentCompany,
        });
        return cls?.key === v;
      });
    case 'location':
    case 'city':
    case 'country':
      return people.filter((p) => p.location && p.location.toLowerCase().includes(v));
    case 'school':
      return people.filter((p) => education.some((e) => e.personId === p.id && k(e.schoolName) === v));
    case 'recent':
      return people.filter((p) => p.connectedAt);
    case 'changed_company': {
      const map = new Map<string, Set<string>>();
      for (const e of employment) {
        const key = e.companyKey || k(e.companyName);
        if (!key) continue;
        if (!map.has(e.personId)) map.set(e.personId, new Set());
        map.get(e.personId)!.add(key);
      }
      const multi = new Set([...map.entries()].filter(([, keys]) => keys.size > 1).map(([id]) => id));
      return people.filter((p) => multi.has(p.id));
    }
    case 'new_since_import': {
      const latest = facts.imports
        .filter((i) => i.hadConnections)
        .sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime())
        .at(-1);
      if (!latest) return [];
      return people.filter((p) => p.firstImportId === latest.id);
    }
    default:
      return [];
  }
}

function k(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}
