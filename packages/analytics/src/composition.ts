import { classifyIndustry, classifyRoleFamily, classifySeniority, parseLocation } from './classify.js';
import { concentrationFromCounts, coverage, keyOf, share } from './stats.js';
import type {
  CompanyFact,
  Concentration,
  Distribution,
  DistributionBin,
  EducationFact,
  EmploymentFact,
  MetricProvenance,
  PersonFact,
} from './types.js';

function bin(
  key: string,
  label: string,
  count: number,
  known: number,
  total: number,
  provenance: MetricProvenance,
  metric: string
): DistributionBin {
  return {
    key,
    label,
    count,
    shareOfKnown: share(count, known),
    shareOfNetwork: share(count, total),
    provenance,
    drilldown: { metric, value: key },
  };
}

function fromMap(
  counts: Map<string, { label: string; count: number; provenance: MetricProvenance }>,
  total: number,
  dimension: string,
  unknownLabel: string,
  knownOverride?: number
): Distribution {
  const known = knownOverride ?? [...counts.values()].reduce((a, b) => a + b.count, 0);
  const bins = [...counts.entries()]
    .map(([key, v]) => bin(key, v.label, v.count, known, total, v.provenance, dimension))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { dimension, coverage: coverage(known, total), bins, unknownLabel };
}

export function companyDistribution(
  people: PersonFact[],
  companies: CompanyFact[],
  mode: 'current' | 'former',
  employment: EmploymentFact[]
): Distribution {
  const total = people.length;
  const companyName = new Map(companies.map((c) => [c.normalizedName, c]));

  if (mode === 'current') {
    const counts = new Map<string, { label: string; count: number; provenance: MetricProvenance }>();
    let known = 0;
    for (const p of people) {
      const key = p.currentCompanyKey || keyOf(p.currentCompany);
      if (!key) continue;
      known += 1;
      const company = companyName.get(key);
      const label = company?.name ?? p.currentCompany ?? key;
      const existing = counts.get(key);
      const provenance: MetricProvenance = {
        trust: 'observed',
        confidence: 'high',
        method: 'Current employer on the person record, grouped by normalised company key.',
        assumptions: [],
      };
      if (existing) existing.count += 1;
      else counts.set(key, { label, count: 1, provenance });
    }
    return fromMap(counts, total, 'company', 'No current employer recorded', known);
  }

  const currentByPerson = new Map(people.map((p) => [p.id, p.currentCompanyKey || keyOf(p.currentCompany)]));
  const former = new Map<string, Set<string>>();
  for (const e of employment) {
    const key = e.companyKey || keyOf(e.companyName);
    if (!key) continue;
    if (e.isCurrent) continue;
    if (currentByPerson.get(e.personId) === key) continue;
    if (!former.has(key)) former.set(key, new Set());
    former.get(key)!.add(e.personId);
  }
  const counts = new Map<string, { label: string; count: number; provenance: MetricProvenance }>();
  for (const [key, peopleIds] of former) {
    const company = companyName.get(key);
    counts.set(key, {
      label: company?.name ?? key,
      count: peopleIds.size,
      provenance: {
        trust: 'derived',
        confidence: 'high',
        method: 'Distinct people with a non-current employment row at this company.',
        assumptions: ['A Connections.csv snapshot with a later different employer is treated as former.'],
      },
    });
  }
  const known = new Set([...former.values()].flatMap((s) => [...s])).size;
  return fromMap(counts, total, 'former_company', 'No former employer recorded', known);
}

export function titleDistribution(people: PersonFact[]): Distribution {
  const counts = new Map<string, { label: string; count: number; provenance: MetricProvenance }>();
  let known = 0;
  for (const p of people) {
    const title = p.currentTitle?.trim();
    if (!title) continue;
    known += 1;
    const key = keyOf(title);
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else {
      counts.set(key, {
        label: title,
        count: 1,
        provenance: {
          trust: 'observed',
          confidence: 'high',
          method: 'Current job title as exported, grouped case-insensitively.',
          assumptions: [],
        },
      });
    }
  }
  return fromMap(counts, people.length, 'title', 'No job title recorded', known);
}

export function roleFamilyDistribution(people: PersonFact[]): Distribution {
  const counts = new Map<string, { label: string; count: number; provenance: MetricProvenance }>();
  let known = 0;
  for (const p of people) {
    const cls = classifyRoleFamily(p.currentTitle);
    if (!cls) continue;
    known += 1;
    const existing = counts.get(cls.key);
    if (existing) existing.count += 1;
    else {
      counts.set(cls.key, {
        label: cls.label,
        count: 1,
        provenance: {
          trust: cls.trust,
          confidence: cls.confidence,
          method: cls.evidence,
          assumptions: ['Role families are inferred from title keywords, not LinkedIn’s job taxonomy.'],
        },
      });
    }
  }
  return fromMap(counts, people.length, 'role_family', 'Title did not match a role family', known);
}

export function seniorityDistribution(people: PersonFact[]): Distribution {
  const counts = new Map<string, { label: string; count: number; provenance: MetricProvenance }>();
  let known = 0;
  for (const p of people) {
    const cls = classifySeniority(p.currentTitle);
    if (!cls) continue;
    known += 1;
    const existing = counts.get(cls.key);
    if (existing) existing.count += 1;
    else {
      counts.set(cls.key, {
        label: cls.label,
        count: 1,
        provenance: {
          trust: cls.trust,
          confidence: cls.confidence,
          method: cls.evidence,
          assumptions: [
            'Seniority is inferred only when the title contains an explicit marker (e.g. Senior, VP).',
          ],
        },
      });
    }
  }
  return fromMap(counts, people.length, 'seniority', 'No seniority marker in title', known);
}

export function industryDistribution(people: PersonFact[]): Distribution {
  const counts = new Map<string, { label: string; count: number; provenance: MetricProvenance }>();
  let known = 0;
  for (const p of people) {
    const cls = classifyIndustry({
      observedIndustry: p.observedIndustry,
      title: p.currentTitle,
      company: p.currentCompany,
    });
    if (!cls) continue;
    known += 1;
    const existing = counts.get(cls.key);
    if (existing) existing.count += 1;
    else {
      counts.set(cls.key, {
        label: cls.label,
        count: 1,
        provenance: {
          trust: cls.trust,
          confidence: cls.confidence,
          method: cls.evidence,
          assumptions: [
            'When LinkedIn did not export industry, it is inferred from title or company keywords.',
            'Inference is not an observed fact.',
          ],
        },
      });
    }
  }
  return fromMap(counts, people.length, 'industry', 'Industry not observed or classifiable', known);
}

export function locationDistribution(people: PersonFact[], grain: 'raw' | 'country' | 'city'): Distribution {
  const counts = new Map<string, { label: string; count: number; provenance: MetricProvenance }>();
  let known = 0;
  for (const p of people) {
    const parsed = parseLocation(p.location);
    if (grain === 'raw') {
      const raw = p.location?.trim();
      if (!raw) continue;
      known += 1;
      const key = keyOf(raw);
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else {
        counts.set(key, {
          label: raw,
          count: 1,
          provenance: {
            trust: 'observed',
            confidence: 'high',
            method: 'Location string as exported.',
            assumptions: ['LinkedIn Connections.csv typically has no location column for connections.'],
          },
        });
      }
      continue;
    }
    if (!parsed) continue;
    const value = grain === 'country' ? parsed.country : parsed.city;
    if (!value) continue;
    known += 1;
    const key = keyOf(value);
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else {
      counts.set(key, {
        label: value,
        count: 1,
        provenance: {
          trust: 'derived',
          confidence: parsed.confidence,
          method: `Parsed from location “${parsed.raw}” (${grain}).`,
          assumptions: ['City/country split is heuristic on comma-separated LinkedIn location strings.'],
        },
      });
    }
  }
  const dim = grain === 'raw' ? 'location' : grain === 'country' ? 'country' : 'city';
  return fromMap(counts, people.length, dim, 'No location recorded', known);
}

export function educationDistribution(people: PersonFact[], education: EducationFact[]): Distribution {
  const bySchool = new Map<string, Set<string>>();
  for (const e of education) {
    const school = e.schoolName?.trim();
    if (!school) continue;
    const key = keyOf(school);
    if (!bySchool.has(key)) bySchool.set(key, new Set());
    bySchool.get(key)!.add(e.personId);
  }
  const personIds = new Set(people.map((p) => p.id));
  const counts = new Map<string, { label: string; count: number; provenance: MetricProvenance }>();
  for (const [key, ids] of bySchool) {
    const n = [...ids].filter((id) => personIds.has(id)).length;
    if (n === 0) continue;
    const sample = education.find((e) => keyOf(e.schoolName) === key)?.schoolName ?? key;
    counts.set(key, {
      label: sample,
      count: n,
      provenance: {
        trust: 'observed',
        confidence: 'high',
        method: 'Distinct people with an education row at this school.',
        assumptions: [
          'Most LinkedIn exports only include the archive owner’s Education.csv, not connections’ schools.',
        ],
      },
    });
  }
  const known = new Set(
    education.filter((e) => e.schoolName && personIds.has(e.personId)).map((e) => e.personId)
  ).size;
  return fromMap(counts, people.length, 'school', 'No school recorded', known);
}

export function concentrationOf(distribution: Distribution): Concentration {
  return concentrationFromCounts(
    distribution.bins.map((b) => b.count),
    distribution.coverage.known,
    distribution.coverage.total
  );
}

export function underrepresented(distribution: Distribution, minKnown = 20): DistributionBin[] {
  const classified = distribution.bins.filter((b) => b.count > 0);
  if (distribution.coverage.known < minKnown || classified.length < 3) return [];
  const shares = classified.map((b) => b.shareOfKnown.percent).sort((a, b) => a - b);
  const median = shares[Math.floor(shares.length / 2)];
  return classified.filter((b) => b.shareOfKnown.percent < median / 2 && b.count > 0);
}
