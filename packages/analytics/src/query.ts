import { classifyIndustry } from './classify.js';
import { keyOf } from './stats.js';
import type { CareerAnalysis } from './career.js';
import type { ChangeReport } from './changes.js';
import type { Distribution } from './types.js';
import type { NetworkFacts } from './types.js';
import type { OpportunityQuery } from './relevance.js';

export type AnalystIntent =
  | { type: 'people_at_company'; company: string }
  | { type: 'people_former_company'; company: string }
  | { type: 'recent_movers' }
  | { type: 'top_companies' }
  | { type: 'industry_count'; industry: string }
  | { type: 'underrepresented' }
  | { type: 'what_changed' }
  | { type: 'people_in_location'; location: string }
  | { type: 'career_path'; from: string; to: string }
  | { type: 'network_size' }
  | { type: 'who_matches'; query: OpportunityQuery }
  | { type: 'unsupported'; question: string };

export interface AnalystAnswer {
  intent: AnalystIntent;
  answer: string;
  records: { personId?: string; name?: string; detail?: string }[];
  confidence: 'high' | 'medium' | 'low';
  limitations: string[];
}

export function parseQuestion(question: string): AnalystIntent {
  const q = question.trim().toLowerCase();
  if (!q) return { type: 'unsupported', question };

  if (/how (large|big)|how many (people|connections)|network size|total connections/.test(q)) {
    return { type: 'network_size' };
  }
  if (/what changed|since (my )?(last|previous) (import|export)/.test(q)) {
    return { type: 'what_changed' };
  }
  if (/underrepresented|missing industries|network gaps/.test(q)) {
    return { type: 'underrepresented' };
  }
  if (/changed (jobs?|companies)|recently (moved|changed)/.test(q)) {
    return { type: 'recent_movers' };
  }
  if (/which companies|top companies|most people/.test(q)) {
    return { type: 'top_companies' };
  }

  const former = q.match(/(?:previously|formerly|used to) work(?:ed)? at ([a-z0-9&.'\-\s]+)/i);
  if (former) return { type: 'people_former_company', company: former[1].trim() };

  const at = q.match(/(?:work(?:s|ed)? at|connections at|who (?:at|in my network works at))\s+(.+?)\??$/i);
  if (at) return { type: 'people_at_company', company: at[1].replace(/^the\s+/, '').trim() };

  const whoAt = q.match(/who (?:in my network )?works at (.+?)\??$/i);
  if (whoAt) return { type: 'people_at_company', company: whoAt[1].trim() };

  const loc = q.match(/(?:in|from|based in)\s+([a-z\s]+)\??$/i);
  if (/where|location|city|country/.test(q) && loc) {
    return { type: 'people_in_location', location: loc[1].trim() };
  }

  const industry = q.match(/(?:how many|who).*(fintech|healthcare|ai|software|consulting|finance)/i);
  if (industry) return { type: 'industry_count', industry: industry[1] };

  const path = q.match(/from\s+(.+?)\s+(?:to|→|->)\s+(.+?)\??$/i);
  if (path) return { type: 'career_path', from: path[1].trim(), to: path[2].trim() };

  return { type: 'unsupported', question };
}

export function answerQuestion(
  intent: AnalystIntent,
  facts: NetworkFacts,
  ctx: {
    companies: Distribution;
    industries: Distribution;
    career: CareerAnalysis;
    changes: ChangeReport;
  }
): AnalystAnswer {
  const people = facts.people;
  switch (intent.type) {
    case 'network_size':
      return {
        intent,
        answer: `${people.length} connections in the imported network (excluding you).`,
        records: [],
        confidence: 'high',
        limitations: [],
      };
    case 'top_companies':
      return {
        intent,
        answer:
          ctx.companies.bins.slice(0, 8).length === 0
            ? 'No current employer data in the import.'
            : ctx.companies.bins
                .slice(0, 8)
                .map((b) => `${b.label}: ${b.count} (${b.shareOfNetwork.percent}% of network)`)
                .join('; ') + `. ${ctx.companies.coverage.unknown} have no current employer.`,
        records: ctx.companies.bins.slice(0, 8).map((b) => ({ name: b.label, detail: `${b.count} people` })),
        confidence: 'high',
        limitations: [],
      };
    case 'people_at_company': {
      const needle = keyOf(intent.company);
      const matches = people.filter((p) => {
        const key = p.currentCompanyKey || keyOf(p.currentCompany);
        return key.includes(needle) || keyOf(p.currentCompany).includes(needle);
      });
      return {
        intent,
        answer: `${matches.length} connection${matches.length === 1 ? '' : 's'} currently list an employer matching “${intent.company}”.`,
        records: matches.slice(0, 50).map((p) => ({
          personId: p.id,
          name: p.name,
          detail: [p.currentTitle, p.currentCompany].filter(Boolean).join(' at ') || undefined,
        })),
        confidence: 'high',
        limitations: [],
      };
    }
    case 'people_former_company': {
      const needle = keyOf(intent.company);
      const ids = new Set(
        facts.employment
          .filter((e) => !e.isCurrent && (e.companyKey || keyOf(e.companyName)).includes(needle))
          .map((e) => e.personId)
      );
      const matches = people.filter((p) => ids.has(p.id));
      return {
        intent,
        answer: `${matches.length} connection${matches.length === 1 ? '' : 's'} have a former employment row matching “${intent.company}”.`,
        records: matches
          .slice(0, 50)
          .map((p) => ({ personId: p.id, name: p.name, detail: p.currentCompany ?? undefined })),
        confidence: 'high',
        limitations: ['Former employment is only present when the export or a later import recorded it.'],
      };
    }
    case 'recent_movers':
      return {
        intent,
        answer: `${ctx.career.peopleWithMultipleEmployers} ${ctx.career.peopleWithMultipleEmployers === 1 ? 'person has' : 'people have'} more than one employer on record (${ctx.career.moves.length} transitions).`,
        records: ctx.career.moves.slice(0, 50).map((m) => ({
          personId: m.personId,
          name: m.name,
          detail: `${m.fromCompany} → ${m.toCompany}`,
        })),
        confidence: 'high',
        limitations: ctx.career.limitations,
      };
    case 'industry_count': {
      const needle = keyOf(intent.industry);
      const bin = ctx.industries.bins.find((b) => b.key === needle || keyOf(b.label).includes(needle));
      const classified = people.filter((p) => {
        const cls = classifyIndustry({
          observedIndustry: p.observedIndustry,
          title: p.currentTitle,
          company: p.currentCompany,
        });
        return cls && (cls.key === needle || keyOf(cls.label).includes(needle));
      });
      return {
        intent,
        answer: bin
          ? `${bin.count} of ${ctx.industries.coverage.known} classified connections (${bin.shareOfKnown.percent}%) match ${bin.label}. ${ctx.industries.coverage.unknown} unclassified.`
          : `No classified connections match “${intent.industry}”. ${ctx.industries.coverage.unknown} unclassified of ${people.length}.`,
        records: classified.slice(0, 50).map((p) => ({
          personId: p.id,
          name: p.name,
          detail: [p.currentTitle, p.currentCompany].filter(Boolean).join(' at ') || undefined,
        })),
        confidence: bin?.provenance.confidence ?? 'low',
        limitations: ['Industry is inferred when LinkedIn did not export it.'],
      };
    }
    case 'underrepresented': {
      const small = ctx.industries.bins.filter((b) => b.shareOfKnown.percent > 0).slice(-5);
      return {
        intent,
        answer:
          ctx.industries.coverage.known < 20
            ? `Only ${ctx.industries.coverage.known} connections could be classified, which is too few for a gap comparison.`
            : `Smaller classified industries: ${small.map((b) => `${b.label} ${b.shareOfKnown.percent}%`).join(', ')}. This is not a recommendation to add connections.`,
        records: small.map((b) => ({ name: b.label, detail: `${b.count} people` })),
        confidence: 'medium',
        limitations: ['Classification coverage bounds this comparison.'],
      };
    }
    case 'what_changed':
      return {
        intent,
        answer: ctx.changes.comparedImports.previous
          ? `${ctx.changes.newConnections.length} first seen in the latest Connections.csv import; ${ctx.changes.notSeenInLatestConnectionsImport.length} not seen in that import; ${ctx.changes.companyChanges.length} company transitions on record.`
          : (ctx.changes.limitations[0] ?? 'Not enough imports to compare.'),
        records: ctx.changes.newConnections.slice(0, 30).map((p) => ({
          personId: p.personId,
          name: p.name,
          detail: 'New in latest connections import',
        })),
        confidence: ctx.changes.comparedImports.previous ? 'high' : 'low',
        limitations: ctx.changes.limitations,
      };
    case 'people_in_location': {
      const needle = intent.location.toLowerCase();
      const matches = people.filter((p) => p.location && p.location.toLowerCase().includes(needle));
      return {
        intent,
        answer: `${matches.length} connection${matches.length === 1 ? '' : 's'} have a location containing “${intent.location}”. ${people.filter((p) => !p.location).length} have no location.`,
        records: matches
          .slice(0, 50)
          .map((p) => ({ personId: p.id, name: p.name, detail: p.location ?? undefined })),
        confidence: matches.length > 0 ? 'high' : 'low',
        limitations: ['Connections.csv usually has no location column.'],
      };
    }
    case 'career_path': {
      const from = keyOf(intent.from);
      const to = keyOf(intent.to);
      const matches = ctx.career.moves.filter(
        (m) => m.fromCompanyKey.includes(from) && m.toCompanyKey.includes(to)
      );
      return {
        intent,
        answer: `${matches.length} recorded transition${matches.length === 1 ? '' : 's'} from an employer matching “${intent.from}” to one matching “${intent.to}”.`,
        records: matches.slice(0, 50).map((m) => ({
          personId: m.personId,
          name: m.name,
          detail: `${m.fromCompany} → ${m.toCompany}`,
        })),
        confidence: 'high',
        limitations: ctx.career.limitations,
      };
    }
    case 'who_matches':
      return {
        intent,
        answer: 'Use the opportunities endpoint with explicit filters.',
        records: [],
        confidence: 'low',
        limitations: [],
      };
    case 'unsupported':
      return {
        intent,
        answer:
          'That question could not be mapped to a structured query. Try asking who works at a company, which companies are largest, who changed employers, what changed since the last import, or how large the network is.',
        records: [],
        confidence: 'low',
        limitations: ['The analyst does not invent statistics. It only runs deterministic queries.'],
      };
  }
}
