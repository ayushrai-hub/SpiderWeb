import { coverage, share, toDate } from './stats.js';
import {
  DEFAULT_RECENCY_BUCKETS,
  type Coverage,
  type PersonFact,
  type RecencyBin,
  type RecencyBucket,
} from './types.js';

export interface RecencyAnalysis {
  coverage: Coverage;
  buckets: RecencyBin[];
  method: string;
  caveat: string;
}

export function calculateRelationshipRecency(
  people: PersonFact[],
  now: Date,
  buckets: RecencyBucket[] = DEFAULT_RECENCY_BUCKETS
): RecencyAnalysis {
  const sorted = [...buckets].sort((a, b) => a.maxDays - b.maxDays);
  const counts = new Map<string, number>(sorted.map((b) => [b.key, 0]));
  let known = 0;

  for (const p of people) {
    const at = toDate(p.connectedAt);
    if (!at) continue;
    known += 1;
    const days = (now.getTime() - at.getTime()) / (24 * 60 * 60 * 1000);
    const bucket = sorted.find((b) => days < b.maxDays) ?? sorted[sorted.length - 1];
    counts.set(bucket.key, (counts.get(bucket.key) ?? 0) + 1);
  }

  const total = people.length;
  return {
    coverage: coverage(known, total),
    buckets: sorted.map((b) => ({
      key: b.key,
      label: b.label,
      count: counts.get(b.key) ?? 0,
      shareOfKnown: share(counts.get(b.key) ?? 0, known),
      shareOfNetwork: share(counts.get(b.key) ?? 0, total),
    })),
    method:
      'Days since Connected On, bucketed. Missing dates are excluded from buckets and shown as coverage.',
    caveat:
      'Connection age is not relationship strength. LinkedIn exports do not contain meeting frequency, message sentiment, or trust.',
  };
}
