import { share } from './stats.js';
import type { Concentration, Coverage, Distribution, Insight } from './types.js';
import { underrepresented } from './composition.js';
import type { CareerAnalysis } from './career.js';
import type { ChangeReport } from './changes.js';
import type { DataQuality } from './quality.js';
import type { GrowthAnalysis } from './growth.js';

export function generateInsights(input: {
  networkSize: number;
  companies: Distribution;
  companyConcentration: Concentration;
  industries: Distribution;
  industryConcentration: Concentration;
  geography: Distribution;
  roles: Distribution;
  growth: GrowthAnalysis;
  career: CareerAnalysis;
  quality: DataQuality;
  changes: ChangeReport;
}): Insight[] {
  const insights: Insight[] = [];
  const n = input.networkSize;
  if (n === 0) return insights;
  void input.geography;
  void input.roles;
  void input.industryConcentration;

  const topCompany = input.companies.bins[0];
  if (topCompany && input.companies.coverage.known >= 10) {
    insights.push({
      id: 'top-company',
      title: `${topCompany.count} connections associated with ${topCompany.label}`,
      description: `${topCompany.shareOfNetwork.percent}% of the network currently lists ${topCompany.label} as employer (${topCompany.count} of ${n}).`,
      category: 'composition',
      confidence: 'high',
      trust: 'derived',
      whyInteresting: 'Shows where current employment is concentrated.',
      evidence: `${topCompany.count} people with current employer ${topCompany.label}.`,
      calculation: {
        expression: `${topCompany.count} / ${n}`,
        numerator: topCompany.count,
        denominator: n,
        percent: topCompany.shareOfNetwork.percent,
      },
      coverage: input.companies.coverage,
      assumptions: ['Grouped by normalised company key so “Acme Inc” and “Acme” count as one company.'],
      affectedCount: topCompany.count,
      drilldown: { metric: 'company', value: topCompany.key },
    });
  }

  if (input.companyConcentration.coverage.known >= 20) {
    insights.push({
      id: 'company-concentration',
      title:
        input.companyConcentration.diversityBand === 'low'
          ? 'Company representation is concentrated'
          : input.companyConcentration.diversityBand === 'high'
            ? 'Company representation is spread out'
            : 'Company representation is moderately concentrated',
      description: input.companyConcentration.explanation,
      category: 'concentration',
      confidence: 'high',
      trust: 'derived',
      whyInteresting: 'Concentration describes whether a few employers dominate the network.',
      evidence: `HHI ${input.companyConcentration.hhi.toFixed(3)} on classified employers; coverage ${input.companyConcentration.coverage.coveragePercent}%.`,
      calculation: {
        expression: 'HHI = Σ (share_i)² over classified current employers',
        numerator: input.companyConcentration.topShare.numerator,
        denominator: input.companyConcentration.topShare.denominator,
        percent: input.companyConcentration.topShare.percent,
      },
      coverage: input.companyConcentration.coverage,
      assumptions: ['Unknown employers are excluded from HHI and reported as coverage.'],
      affectedCount: input.companyConcentration.coverage.known,
      drilldown: { metric: 'company' },
    });
  }

  const topIndustry = input.industries.bins[0];
  if (topIndustry && input.industries.coverage.known >= 15) {
    insights.push({
      id: 'top-industry',
      title: `${topIndustry.label} is the largest classified industry`,
      description: `${topIndustry.count} of ${input.industries.coverage.known} classified connections (${topIndustry.shareOfKnown.percent}%). ${input.industries.coverage.unknown} could not be classified.`,
      category: 'composition',
      confidence: topIndustry.provenance.confidence,
      trust: 'inferred',
      whyInteresting: 'Industry mix is mostly inferred when LinkedIn did not export an industry field.',
      evidence: topIndustry.provenance.method,
      calculation: {
        expression: `${topIndustry.count} / ${input.industries.coverage.known} classified`,
        numerator: topIndustry.count,
        denominator: input.industries.coverage.known,
        percent: topIndustry.shareOfKnown.percent,
      },
      coverage: input.industries.coverage,
      assumptions: topIndustry.provenance.assumptions,
      affectedCount: topIndustry.count,
      drilldown: { metric: 'industry', value: topIndustry.key },
    });
  }

  for (const gap of underrepresented(input.industries).slice(0, 3)) {
    insights.push({
      id: `gap-industry-${gap.key}`,
      title: `${gap.label} is relatively small in this network`,
      description: `${gap.count} of ${input.industries.coverage.known} classified connections (${gap.shareOfKnown.percent}%). This is below half the median category share. That is a description of the data, not a recommendation to add connections.`,
      category: 'gap',
      confidence: gap.provenance.confidence,
      trust: 'inferred',
      whyInteresting: 'Useful if you are checking coverage of a sector you care about.',
      evidence: `${gap.count} classified as ${gap.label}.`,
      calculation: {
        expression: `${gap.count} / ${input.industries.coverage.known}`,
        numerator: gap.count,
        denominator: input.industries.coverage.known,
        percent: gap.shareOfKnown.percent,
      },
      coverage: input.industries.coverage,
      assumptions: gap.provenance.assumptions,
      affectedCount: gap.count,
      drilldown: { metric: 'industry', value: gap.key },
    });
  }

  if (input.growth.coverage.known >= 10) {
    const dated = input.growth.coverage.known;
    insights.push({
      id: 'growth-window',
      title: `${input.growth.last90Days} connections added in the last 90 days`,
      description: `${input.growth.last90Days} of ${dated} dated connections fall in the last 90 days. Growth is ${input.growth.acceleration}. Earliest Connected On in the file: ${input.growth.earliestDate?.slice(0, 10) ?? 'unknown'}.`,
      category: 'growth',
      confidence: 'high',
      trust: 'derived',
      whyInteresting: 'Shows recent network expansion using only rows that have a connection date.',
      evidence: `Dated connections: ${dated} of ${n} (${input.growth.coverage.coveragePercent}% coverage).`,
      calculation: {
        expression: `${input.growth.last90Days} dated connections with Connected On in the last 90 days`,
        numerator: input.growth.last90Days,
        denominator: dated,
        percent: share(input.growth.last90Days, dated).percent,
      },
      coverage: input.growth.coverage,
      timePeriod: {
        from: new Date(Date.now() - 90 * 86400000).toISOString(),
        to: new Date().toISOString(),
        label: 'Last 90 days',
      },
      assumptions: [
        'People without Connected On are excluded from growth, not counted as zero new connections.',
      ],
      affectedCount: input.growth.last90Days,
      drilldown: { metric: 'recent' },
    });
  }

  if (input.career.peopleWithMultipleEmployers > 0) {
    insights.push({
      id: 'career-moves',
      title: `${input.career.peopleWithMultipleEmployers} people have more than one employer on record`,
      description: `${input.career.moves.length} company-to-company transitions were reconstructed from employment rows. ${input.career.limitations[0]}`,
      category: 'career',
      confidence: 'high',
      trust: 'derived',
      whyInteresting:
        'Employment history (including incremental imports) is the only supported evidence of a job change.',
      evidence: `${input.career.moves.length} transitions across ${input.career.peopleWithMultipleEmployers} people.`,
      calculation: {
        expression: 'count of people with ≥2 distinct company keys in employment',
        numerator: input.career.peopleWithMultipleEmployers,
        denominator: n,
        percent: share(input.career.peopleWithMultipleEmployers, n).percent,
      },
      assumptions: input.career.limitations,
      affectedCount: input.career.peopleWithMultipleEmployers,
      drilldown: { metric: 'changed_company' },
    });
  }

  const loc = input.quality.fields.find((f) => f.field === 'location');
  if (loc && loc.coverage.coveragePercent < 5) {
    insights.push({
      id: 'location-coverage',
      title: 'Location is almost never present for connections',
      description: `${loc.coverage.known} of ${n} connections have a location (${loc.coverage.coveragePercent}%). LinkedIn’s Connections.csv does not include a location column, so geographic analytics cannot be computed from a typical export.`,
      category: 'quality',
      confidence: 'high',
      trust: 'observed',
      whyInteresting: 'Prevents treating missing geography as “everyone is in one place”.',
      evidence: `location IS NULL on ${loc.coverage.unknown} people rows.`,
      calculation: {
        expression: `${loc.coverage.known} / ${n}`,
        numerator: loc.coverage.known,
        denominator: n,
        percent: loc.coverage.coveragePercent,
      },
      coverage: loc.coverage,
      assumptions: [],
      affectedCount: loc.coverage.unknown,
      drilldown: { metric: 'quality', value: 'location' },
    });
  }

  if (input.changes.newConnections.length > 0 && input.changes.comparedImports.previous) {
    insights.push({
      id: 'new-since-import',
      title: `${input.changes.newConnections.length} connections first appeared in the latest Connections.csv import`,
      description: `Compared with the previous connections import. ${input.changes.notSeenInLatestConnectionsImport.length} people from earlier imports were not in the latest Connections.csv.`,
      category: 'change',
      confidence: 'high',
      trust: 'derived',
      whyInteresting: 'This is the supported way to see what changed between exports.',
      evidence: `first_import_id = ${input.changes.comparedImports.current?.id}.`,
      calculation: {
        expression: 'count of people whose first_import_id is the latest connections import',
        numerator: input.changes.newConnections.length,
        denominator: n,
        percent: share(input.changes.newConnections.length, n).percent,
      },
      assumptions: input.changes.limitations,
      affectedCount: input.changes.newConnections.length,
      drilldown: { metric: 'new_since_import' },
    });
  }

  return insights;
}

export function coverageNote(cov: Coverage, noun: string): string {
  return `${cov.known} ${noun} classified, ${cov.unknown} unknown (${cov.coveragePercent}% coverage).`;
}
