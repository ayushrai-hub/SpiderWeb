import { describe, expect, it } from 'vitest';
import {
  buildAnalyticsReport,
  calculateCareerMobility,
  calculateNetworkGrowth,
  companyDistribution,
  herfindahl,
  parseQuestion,
  recordsForMetric,
  relationshipContextScore,
  share,
} from '@intel/analytics';
import type { EmploymentFact, NetworkFacts, PersonFact } from '@intel/analytics';

const NOW = new Date('2026-09-20T12:00:00Z');

function person(partial: Partial<PersonFact> & { id: string; name: string }): PersonFact {
  return {
    interactionCount: 0,
    ...partial,
  };
}

function connections(spec: { company: string | null; n: number; prefix: string }): PersonFact[] {
  return Array.from({ length: spec.n }, (_, i) =>
    person({
      id: `${spec.prefix}-${i}`,
      name: `${spec.prefix} ${i}`,
      currentCompany: spec.company,
      currentCompanyKey: spec.company ? spec.company.toLowerCase() : null,
      currentTitle: spec.company ? 'Engineer' : null,
      connectedAt: `2024-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
    })
  );
}

describe('share and HHI', () => {
  it('does not treat missing as zero in the percentage of classified records', () => {
    const ofNetwork = share(40, 100);
    const ofKnown = share(40, 90);
    expect(ofNetwork.percent).toBe(40);
    expect(ofKnown.percent).toBe(44.4);
  });

  it('computes HHI on classified shares', () => {
    // 40, 30, 20 of 90 classified
    const hhi = herfindahl([40, 30, 20]);
    expect(hhi).toBeCloseTo((40 / 90) ** 2 + (30 / 90) ** 2 + (20 / 90) ** 2, 8);
  });
});

describe('company distribution fixture: 40 A / 30 B / 20 C / 10 unknown', () => {
  const people = [
    ...connections({ company: 'Company A', n: 40, prefix: 'a' }),
    ...connections({ company: 'Company B', n: 30, prefix: 'b' }),
    ...connections({ company: 'Company C', n: 20, prefix: 'c' }),
    ...connections({ company: null, n: 10, prefix: 'u' }),
  ];
  const dist = companyDistribution(people, [], 'current', []);

  it('counts each company and unknown coverage', () => {
    expect(dist.coverage.total).toBe(100);
    expect(dist.coverage.known).toBe(90);
    expect(dist.coverage.unknown).toBe(10);
    expect(dist.coverage.coveragePercent).toBe(90);
    expect(dist.bins.find((b) => b.label === 'Company A')?.count).toBe(40);
    expect(dist.bins.find((b) => b.label === 'Company B')?.count).toBe(30);
    expect(dist.bins.find((b) => b.label === 'Company C')?.count).toBe(20);
  });

  it('reports 40% of network and 44.4% of classified for Company A', () => {
    const a = dist.bins.find((b) => b.label === 'Company A')!;
    expect(a.shareOfNetwork.percent).toBe(40);
    expect(a.shareOfKnown.percent).toBe(44.4);
    expect(a.shareOfNetwork.numerator).toBe(40);
    expect(a.shareOfNetwork.denominator).toBe(100);
  });
});

describe('growth', () => {
  it('excludes missing dates from cumulative and reports coverage', () => {
    const people = [
      person({ id: '1', name: 'A', connectedAt: '2024-01-15T00:00:00Z' }),
      person({ id: '2', name: 'B', connectedAt: '2024-01-20T00:00:00Z' }),
      person({ id: '3', name: 'C', connectedAt: null }),
    ];
    const growth = calculateNetworkGrowth(people, NOW);
    expect(growth.coverage.known).toBe(2);
    expect(growth.coverage.unknown).toBe(1);
    expect(growth.series.at(-1)?.cumulative).toBe(2);
    expect(growth.earliestDate?.startsWith('2024-01-15')).toBe(true);
  });
});

describe('career mobility', () => {
  it('creates a transition only from consecutive different company keys', () => {
    const people = [person({ id: 'p1', name: 'Ada' })];
    const employment: EmploymentFact[] = [
      {
        personId: 'p1',
        companyName: 'Acme',
        companyKey: 'acme',
        isCurrent: false,
        observedAt: '2023-01-01T00:00:00Z',
      },
      {
        personId: 'p1',
        companyName: 'Beta',
        companyKey: 'beta',
        isCurrent: true,
        observedAt: '2024-06-01T00:00:00Z',
      },
    ];
    const career = calculateCareerMobility(people, employment);
    expect(career.peopleWithMultipleEmployers).toBe(1);
    expect(career.moves).toHaveLength(1);
    expect(career.moves[0].fromCompany).toBe('Acme');
    expect(career.moves[0].toCompany).toBe('Beta');
    expect(career.flows[0].count).toBe(1);
  });

  it('does not invent a promotion from two titles without a company change', () => {
    const people = [person({ id: 'p1', name: 'Ada' })];
    const employment: EmploymentFact[] = [
      {
        personId: 'p1',
        companyName: 'Acme',
        companyKey: 'acme',
        title: 'Engineer',
        isCurrent: false,
        observedAt: '2023-01-01T00:00:00Z',
      },
      {
        personId: 'p1',
        companyName: 'Acme',
        companyKey: 'acme',
        title: 'Senior Engineer',
        isCurrent: true,
        observedAt: '2024-06-01T00:00:00Z',
      },
    ];
    expect(calculateCareerMobility(people, employment).moves).toHaveLength(0);
  });
});

describe('relationship context score', () => {
  it('explains contributions and refuses to call it strength', () => {
    const personRow = person({
      id: 'p1',
      name: 'Ada',
      currentCompany: 'Acme',
      currentCompanyKey: 'acme',
      currentTitle: 'Engineer',
      profileUrl: 'https://www.linkedin.com/in/ada',
      connectedAt: '2023-01-01T00:00:00Z',
    });
    const score = relationshipContextScore(
      personRow,
      [{ personId: 'p1', companyKey: 'acme', companyName: 'Acme', isCurrent: true }],
      [],
      { personId: 'self', name: 'You', companyKeys: ['acme'], schools: [] },
      NOW
    );
    expect(score.contributions.some((c) => c.key === 'shared_company')).toBe(true);
    expect(score.disclaimer.toLowerCase()).toContain('not relationship strength');
  });
});

describe('buildAnalyticsReport', () => {
  const facts: NetworkFacts = {
    people: [
      ...connections({ company: 'OpenAI', n: 5, prefix: 'ai' }).map((p, i) => ({
        ...p,
        currentTitle: i === 0 ? 'AI Engineer' : p.currentTitle,
      })),
      ...connections({ company: 'Acme', n: 5, prefix: 'ac' }),
    ],
    employment: [],
    education: [],
    companies: [
      {
        id: 'c1',
        name: 'OpenAI',
        normalizedName: 'openai',
        currentCount: 5,
        formerCount: 0,
        connectionCount: 5,
      },
      {
        id: 'c2',
        name: 'Acme',
        normalizedName: 'acme',
        currentCount: 5,
        formerCount: 0,
        connectionCount: 5,
      },
    ],
    imports: [
      {
        id: 'imp-1',
        uploadedAt: '2026-01-01T00:00:00Z',
        status: 'completed',
        hadConnections: true,
      },
    ],
    self: { personId: 'self', name: 'You', companyKeys: [], schools: [] },
  };

  it('never presents inferred industry as observed', () => {
    const report = buildAnalyticsReport(facts, { now: NOW });
    expect(report.networkSize).toBe(10);
    expect(report.hasData).toBe(true);
    const industryInsight = report.insights.find((i) => i.id === 'top-industry');
    if (industryInsight) {
      expect(industryInsight.trust).toBe('inferred');
    }
    expect(report.graphCaveat).toMatch(/affiliation graph/);
    expect(report.quality.fields.find((f) => f.field === 'company')?.coverage.known).toBe(10);
  });

  it('drilldown for a company returns the contributing people', () => {
    const openai = facts.people.filter((p) => p.currentCompany === 'OpenAI');
    const records = recordsForMetric(facts, 'company', 'openai');
    expect(records).toHaveLength(openai.length);
  });
});

describe('career mobility', () => {
  it('does not treat the importer’s own résumé as a network career move', () => {
    const people = [
      person({ id: 'c1', name: 'Jane Smith', currentCompany: 'Acme', currentCompanyKey: 'acme' }),
    ];
    const employment: EmploymentFact[] = [
      {
        personId: 'self',
        companyName: 'Acme',
        companyKey: 'acme',
        isCurrent: false,
        startedOn: '2018-01-01',
      },
      {
        personId: 'self',
        companyName: 'DataFlow',
        companyKey: 'dataflow',
        isCurrent: false,
        startedOn: '2021-01-01',
      },
      {
        personId: 'self',
        companyName: 'Globex',
        companyKey: 'globex',
        isCurrent: true,
        startedOn: '2024-01-01',
      },
      {
        personId: 'c1',
        companyName: 'Acme',
        companyKey: 'acme',
        isCurrent: true,
      },
    ];
    const analysis = calculateCareerMobility(people, employment);
    expect(analysis.peopleWithMultipleEmployers).toBe(0);
    expect(analysis.moves).toHaveLength(0);
  });

  it('reconstructs connection moves only from consecutive distinct company keys', () => {
    const people = [person({ id: 'c1', name: 'Jane Smith' })];
    const employment: EmploymentFact[] = [
      {
        personId: 'c1',
        companyName: 'Acme Corp',
        companyKey: 'acme',
        isCurrent: false,
        startedOn: '2019-01-01',
      },
      {
        personId: 'c1',
        companyName: 'OpenAI',
        companyKey: 'openai',
        isCurrent: true,
        startedOn: '2024-06-01',
      },
    ];
    const analysis = calculateCareerMobility(people, employment);
    expect(analysis.peopleWithMultipleEmployers).toBe(1);
    expect(analysis.moves).toHaveLength(1);
    expect(analysis.moves[0].name).toBe('Jane Smith');
    expect(analysis.moves[0].fromCompany).toBe('Acme Corp');
    expect(analysis.moves[0].toCompany).toBe('OpenAI');
  });
});

describe('natural-language mapping', () => {
  it('maps company and change questions without inventing an intent', () => {
    expect(parseQuestion('Who in my network works at OpenAI?')).toMatchObject({
      type: 'people_at_company',
      company: 'openai',
    });
    expect(parseQuestion('What changed since my last import?').type).toBe('what_changed');
    expect(parseQuestion('Tell me who my best friends are').type).toBe('unsupported');
  });
});
