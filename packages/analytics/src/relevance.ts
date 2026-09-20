import { classifyIndustry, parseLocation } from './classify.js';
import { keyOf, toDate } from './stats.js';
import type { EducationFact, EmploymentFact, PersonFact, SelfFact } from './types.js';

export interface SignalContribution {
  key: string;
  label: string;
  points: number;
  evidence: string;
}

export interface RelevanceBreakdown {
  personId: string;
  score: number;
  contributions: SignalContribution[];
  disclaimer: string;
}

const DISCLAIMER =
  'This is a Relationship Context Score from observable overlap in the export. It is not relationship strength, trust, or how well you know this person.';

export function relationshipContextScore(
  person: PersonFact,
  employment: EmploymentFact[],
  education: EducationFact[],
  self: SelfFact | null,
  now: Date
): RelevanceBreakdown {
  const contributions: SignalContribution[] = [];
  const personKeys = new Set(
    employment.filter((e) => e.personId === person.id).map((e) => e.companyKey || keyOf(e.companyName))
  );
  personKeys.delete('');

  if (self) {
    const sharedCompanies = [...personKeys].filter((k) => self.companyKeys.includes(k));
    if (sharedCompanies.length > 0) {
      contributions.push({
        key: 'shared_company',
        label: 'Shared employer',
        points: 25,
        evidence: `Worked at a company also on your profile (${sharedCompanies.length} overlap).`,
      });
    }
    const schools = education
      .filter((e) => e.personId === person.id && e.schoolName)
      .map((e) => e.schoolName!.trim().toLowerCase());
    const sharedSchools = schools.filter((s) => self.schools.includes(s));
    if (sharedSchools.length > 0) {
      contributions.push({
        key: 'shared_school',
        label: 'Shared school',
        points: 20,
        evidence: `Attended a school also on your profile.`,
      });
    }
    const personIndustry = classifyIndustry({
      observedIndustry: person.observedIndustry,
      title: person.currentTitle,
      company: person.currentCompany,
    });
    const selfIndustry = classifyIndustry({
      observedIndustry: self.industry,
      company: self.companyKeys[0],
    });
    if (personIndustry && selfIndustry && personIndustry.key === selfIndustry.key) {
      contributions.push({
        key: 'common_industry',
        label: 'Common classified industry',
        points: 10,
        evidence: `Both classified as ${personIndustry.label} (${personIndustry.trust}).`,
      });
    }
    const personGeo = parseLocation(person.location);
    const selfGeo = parseLocation(self.location);
    if (personGeo?.country && selfGeo?.country && personGeo.country === selfGeo.country) {
      contributions.push({
        key: 'common_country',
        label: 'Same country',
        points: 8,
        evidence: `Both located in ${personGeo.country}.`,
      });
    }
  }

  const connected = toDate(person.connectedAt);
  if (connected) {
    const years = (now.getTime() - connected.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (years >= 1 && years < 5) {
      contributions.push({
        key: 'connected_1_5y',
        label: 'Connected 1–5 years ago',
        points: 5,
        evidence: `Connected On is ${connected.toISOString().slice(0, 10)}.`,
      });
    }
  }

  const companyKeys = [...personKeys];
  if (companyKeys.length > 1) {
    contributions.push({
      key: 'career_change',
      label: 'Multiple employers on record',
      points: 15,
      evidence: `${companyKeys.length} distinct employers in employment history.`,
    });
  }

  let completeness = 0;
  if (person.profileUrl) completeness += 1;
  if (person.currentCompany) completeness += 1;
  if (person.currentTitle) completeness += 1;
  if (person.connectedAt) completeness += 1;
  if (completeness >= 3) {
    contributions.push({
      key: 'profile_completeness',
      label: 'Relatively complete record',
      points: 5,
      evidence: `${completeness} of 4 core fields present (URL, company, title, connection date).`,
    });
  }

  const score = Math.min(
    100,
    contributions.reduce((a, c) => a + c.points, 0)
  );
  return { personId: person.id, score, contributions, disclaimer: DISCLAIMER };
}

export interface OpportunityMatch {
  personId: string;
  name: string;
  currentCompany: string | null;
  currentTitle: string | null;
  reasons: string[];
  contextScore: number;
}

export interface OpportunityQuery {
  company?: string;
  pastCompany?: string;
  role?: string;
  industry?: string;
  location?: string;
  recentlyMoved?: boolean;
  olderQuiet?: boolean;
}

export function findOpportunities(
  people: PersonFact[],
  employment: EmploymentFact[],
  education: EducationFact[],
  self: SelfFact | null,
  now: Date,
  query: OpportunityQuery,
  limit = 50
): OpportunityMatch[] {
  const results: OpportunityMatch[] = [];
  const companyQ = query.company ? keyOf(query.company) : '';
  const pastQ = query.pastCompany ? keyOf(query.pastCompany) : '';
  const roleQ = query.role ? query.role.toLowerCase() : '';
  const industryQ = query.industry ? keyOf(query.industry) : '';
  const locationQ = query.location ? query.location.toLowerCase() : '';

  for (const p of people) {
    const reasons: string[] = [];
    if (companyQ) {
      const key = p.currentCompanyKey || keyOf(p.currentCompany);
      if (!key.includes(companyQ) && keyOf(p.currentCompany) !== companyQ) continue;
      reasons.push(`Works at ${p.currentCompany}`);
    }
    if (pastQ) {
      const past = employment.some(
        (e) => e.personId === p.id && !e.isCurrent && (e.companyKey || keyOf(e.companyName)).includes(pastQ)
      );
      if (!past) continue;
      reasons.push(`Previously worked at a matching company`);
    }
    if (roleQ) {
      if (!p.currentTitle || !p.currentTitle.toLowerCase().includes(roleQ)) continue;
      reasons.push(`Title contains “${query.role}”`);
    }
    if (industryQ) {
      const cls = classifyIndustry({
        observedIndustry: p.observedIndustry,
        title: p.currentTitle,
        company: p.currentCompany,
      });
      if (!cls || (cls.key !== industryQ && keyOf(cls.label) !== industryQ)) continue;
      reasons.push(`Classified industry: ${cls.label} (${cls.confidence} confidence)`);
    }
    if (locationQ) {
      if (!p.location || !p.location.toLowerCase().includes(locationQ)) continue;
      reasons.push(`Location contains “${query.location}”`);
    }
    if (query.recentlyMoved) {
      const keys = new Set(
        employment.filter((e) => e.personId === p.id).map((e) => e.companyKey || keyOf(e.companyName))
      );
      keys.delete('');
      if (keys.size < 2) continue;
      reasons.push('More than one employer on record');
    }
    if (query.olderQuiet) {
      const connected = toDate(p.connectedAt);
      if (!connected) continue;
      const years = (now.getTime() - connected.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      const last = toDate(p.lastInteractionAt);
      const quiet = !last || now.getTime() - last.getTime() > 365 * 24 * 60 * 60 * 1000;
      if (years < 2 || !quiet) continue;
      reasons.push('Connected over 2 years ago with no recorded contact in the last year');
    }

    if (reasons.length === 0 && !hasAnyFilter(query)) continue;

    const ctx = relationshipContextScore(p, employment, education, self, now);
    results.push({
      personId: p.id,
      name: p.name,
      currentCompany: p.currentCompany ?? null,
      currentTitle: p.currentTitle ?? null,
      reasons,
      contextScore: ctx.score,
    });
  }

  return results
    .sort((a, b) => b.contextScore - a.contextScore || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function hasAnyFilter(q: OpportunityQuery): boolean {
  return Boolean(
    q.company || q.pastCompany || q.role || q.industry || q.location || q.recentlyMoved || q.olderQuiet
  );
}

/** Older connection + shared context, without calling the person "dormant". */
export function reconnectionCandidates(
  people: PersonFact[],
  employment: EmploymentFact[],
  education: EducationFact[],
  self: SelfFact | null,
  now: Date,
  limit = 25
): OpportunityMatch[] {
  return findOpportunities(people, employment, education, self, now, { olderQuiet: true }, limit * 3)
    .filter((o) => o.reasons.length > 0)
    .slice(0, limit);
}
