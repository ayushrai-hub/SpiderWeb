import { coverage, mean, sampleStdDev, share, toDate, utcMonth } from './stats.js';
import type { Coverage, PersonFact, Share } from './types.js';

export interface GrowthPoint {
  month: string;
  added: number;
  cumulative: number;
  shareOfDated: Share;
}

export interface GrowthAnalysis {
  coverage: Coverage;
  earliestDate: string | null;
  latestDate: string | null;
  series: GrowthPoint[];
  last90Days: number;
  previous90Days: number;
  acceleration: 'accelerating' | 'decelerating' | 'steady' | 'unknown';
  unusualMonths: { month: string; added: number; zScore: number }[];
  method: string;
}

export function calculateNetworkGrowth(people: PersonFact[], now: Date): GrowthAnalysis {
  const dated: { id: string; at: Date }[] = [];
  for (const p of people) {
    const at = toDate(p.connectedAt);
    if (at) dated.push({ id: p.id, at });
  }
  dated.sort((a, b) => a.at.getTime() - b.at.getTime());

  const cov = coverage(dated.length, people.length);
  const method =
    'Monthly counts of people whose Connected On date is present. Cumulative is running total of dated connections only — it is not the full network size when dates are missing.';

  if (dated.length === 0) {
    return {
      coverage: cov,
      earliestDate: null,
      latestDate: null,
      series: [],
      last90Days: 0,
      previous90Days: 0,
      acceleration: 'unknown',
      unusualMonths: [],
      method,
    };
  }

  const byMonth = new Map<string, number>();
  for (const d of dated) {
    const m = utcMonth(d.at);
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }

  const months = [...byMonth.keys()].sort();
  // Fill gaps so a missing month is 0, not a skipped tick.
  const filled: string[] = [];
  const start = months[0];
  const end = months[months.length - 1];
  const cursor = new Date(`${start}-01T00:00:00Z`);
  const endDate = new Date(`${end}-01T00:00:00Z`);
  while (cursor <= endDate) {
    filled.push(utcMonth(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  let cumulative = 0;
  const series: GrowthPoint[] = filled.map((month) => {
    const added = byMonth.get(month) ?? 0;
    cumulative += added;
    return { month, added, cumulative, shareOfDated: share(added, dated.length) };
  });

  const ms90 = 90 * 24 * 60 * 60 * 1000;
  const last90Days = dated.filter((d) => now.getTime() - d.at.getTime() <= ms90).length;
  const previous90Days = dated.filter((d) => {
    const age = now.getTime() - d.at.getTime();
    return age > ms90 && age <= 2 * ms90;
  }).length;

  let acceleration: GrowthAnalysis['acceleration'] = 'unknown';
  if (previous90Days + last90Days >= 8) {
    if (last90Days > previous90Days * 1.25) acceleration = 'accelerating';
    else if (last90Days < previous90Days * 0.75) acceleration = 'decelerating';
    else acceleration = 'steady';
  }

  const added = series.map((s) => s.added);
  const m = mean(added);
  const sd = sampleStdDev(added);
  const unusualMonths =
    series.length >= 12 && sd > 0
      ? series
          .filter((s) => (s.added - m) / sd >= 2)
          .map((s) => ({ month: s.month, added: s.added, zScore: (s.added - m) / sd }))
      : [];

  return {
    coverage: cov,
    earliestDate: dated[0].at.toISOString(),
    latestDate: dated[dated.length - 1].at.toISOString(),
    series,
    last90Days,
    previous90Days,
    acceleration,
    unusualMonths,
    method,
  };
}
