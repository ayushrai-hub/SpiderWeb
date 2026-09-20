import {
  CONCENTRATION_THRESHOLDS,
  DIVERSITY_THRESHOLDS,
  type Concentration,
  type Coverage,
  type DiversityBand,
  type Share,
} from './types.js';

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function coverage(known: number, total: number): Coverage {
  const unknown = Math.max(0, total - known);
  return {
    known,
    unknown,
    total,
    coveragePercent: total > 0 ? round1((known / total) * 100) : 0,
  };
}

export function share(numerator: number, denominator: number): Share {
  const ratio = denominator > 0 ? numerator / denominator : 0;
  return {
    numerator,
    denominator,
    ratio,
    percent: round1(ratio * 100),
  };
}

/** Sum of squared shares. Pass classified counts; unknown is excluded. */
export function herfindahl(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return counts.reduce((acc, n) => acc + (n / total) ** 2, 0);
}

/** Shannon entropy in nats. */
export function shannonEntropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let h = 0;
  for (const n of counts) {
    if (n <= 0) continue;
    const p = n / total;
    h -= p * Math.log(p);
  }
  return h;
}

export function normalizedEntropy(counts: number[]): number {
  const n = counts.filter((c) => c > 0).length;
  if (n <= 1) return 0;
  return shannonEntropy(counts) / Math.log(n);
}

export function diversityBand(normalized: number): DiversityBand {
  if (normalized >= DIVERSITY_THRESHOLDS.high) return 'high';
  if (normalized >= DIVERSITY_THRESHOLDS.moderate) return 'moderate';
  return 'low';
}

export function concentrationFromCounts(
  counts: number[],
  classified: number,
  networkSize: number,
  topN = 5
): Concentration {
  const sorted = [...counts].filter((c) => c > 0).sort((a, b) => b - a);
  const hhi = herfindahl(sorted);
  const entropy = shannonEntropy(sorted);
  const nEnt = normalizedEntropy(sorted);
  const band = diversityBand(nEnt);
  const top = sorted.slice(0, topN).reduce((a, b) => a + b, 0);
  const cov = coverage(classified, networkSize);

  let explanation: string;
  if (classified === 0) {
    explanation = 'Not enough classified records to measure concentration.';
  } else if (hhi >= CONCENTRATION_THRESHOLDS.high) {
    explanation = `The network is concentrated: the top ${Math.min(topN, sorted.length)} groups account for ${share(top, classified).percent}% of classified records (HHI ${round1(hhi * 10000)} on the 0–10,000 scale).`;
  } else if (hhi >= CONCENTRATION_THRESHOLDS.moderate) {
    explanation = `Moderate concentration. The top ${Math.min(topN, sorted.length)} groups account for ${share(top, classified).percent}% of classified records.`;
  } else {
    explanation = `The classified records are spread across many groups. The top ${Math.min(topN, sorted.length)} account for ${share(top, classified).percent}%.`;
  }

  return {
    hhi,
    entropy,
    normalizedEntropy: nEnt,
    diversityBand: band,
    topShare: share(top, classified),
    topN,
    coverage: cov,
    explanation,
    method: `HHI = sum of squared shares of classified records (0–1). Diversity band from normalized Shannon entropy: high ≥ ${DIVERSITY_THRESHOLDS.high}, moderate ≥ ${DIVERSITY_THRESHOLDS.moderate}. Unknown records are excluded from HHI and shown as coverage.`,
  };
}

export function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function utcMonth(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const varSum = values.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return Math.sqrt(varSum / (values.length - 1));
}

export function keyOf(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}
