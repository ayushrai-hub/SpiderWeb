import { classifyIndustry, classifyRoleFamily } from './classify.js';
import { keyOf, toDate } from './stats.js';
import type { EmploymentFact, PersonFact } from './types.js';

export interface CareerMove {
  personId: string;
  name: string;
  fromCompany: string;
  fromCompanyKey: string;
  toCompany: string;
  toCompanyKey: string;
  fromTitle: string | null;
  toTitle: string | null;
  observedAt: string | null;
  evidence: string;
}

export interface CareerFlow {
  fromKey: string;
  fromLabel: string;
  toKey: string;
  toLabel: string;
  count: number;
  personIds: string[];
}

export interface CareerAnalysis {
  moves: CareerMove[];
  flows: CareerFlow[];
  peopleWithMultipleEmployers: number;
  method: string;
  limitations: string[];
}

function employmentOrder(a: EmploymentFact, b: EmploymentFact): number {
  const aStart = a.startedOn ? String(a.startedOn) : '';
  const bStart = b.startedOn ? String(b.startedOn) : '';
  if (aStart && bStart && aStart !== bStart) return aStart.localeCompare(bStart);
  const aObs = toDate(a.observedAt)?.getTime() ?? 0;
  const bObs = toDate(b.observedAt)?.getTime() ?? 0;
  if (aObs !== bObs) return aObs - bObs;
  if (a.isCurrent !== b.isCurrent) return a.isCurrent ? 1 : -1;
  return 0;
}

export function calculateCareerMobility(people: PersonFact[], employment: EmploymentFact[]): CareerAnalysis {
  const byPerson = new Map<string, EmploymentFact[]>();
  for (const e of employment) {
    const key = e.companyKey || keyOf(e.companyName);
    if (!key) continue;
    if (!byPerson.has(e.personId)) byPerson.set(e.personId, []);
    byPerson.get(e.personId)!.push(e);
  }

  const names = new Map(people.map((p) => [p.id, p.name]));
  const knownPeople = new Set(people.map((p) => p.id));
  const moves: CareerMove[] = [];
  let peopleWithMultipleEmployers = 0;

  for (const [personId, rows] of byPerson) {
    if (!knownPeople.has(personId)) continue;
    const ordered = [...rows].sort(employmentOrder);
    const uniqueKeys = new Set(ordered.map((r) => r.companyKey || keyOf(r.companyName)));
    if (uniqueKeys.size > 1) peopleWithMultipleEmployers += 1;

    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const next = ordered[i];
      const fromKey = prev.companyKey || keyOf(prev.companyName);
      const toKey = next.companyKey || keyOf(next.companyName);
      if (!fromKey || !toKey || fromKey === toKey) continue;
      const observed = toDate(next.observedAt) ?? toDate(next.startedOn);
      moves.push({
        personId,
        name: names.get(personId) ?? personId,
        fromCompany: prev.companyName ?? fromKey,
        fromCompanyKey: fromKey,
        toCompany: next.companyName ?? toKey,
        toCompanyKey: toKey,
        fromTitle: prev.title ?? null,
        toTitle: next.title ?? null,
        observedAt: observed ? observed.toISOString() : null,
        evidence: `${names.get(personId) ?? 'This person'} has employment rows at ${prev.companyName} then ${next.companyName}.`,
      });
    }
  }

  const flowMap = new Map<string, CareerFlow>();
  for (const move of moves) {
    const id = `${move.fromCompanyKey}→${move.toCompanyKey}`;
    const existing = flowMap.get(id);
    if (existing) {
      existing.count += 1;
      existing.personIds.push(move.personId);
    } else {
      flowMap.set(id, {
        fromKey: move.fromCompanyKey,
        fromLabel: move.fromCompany,
        toKey: move.toCompanyKey,
        toLabel: move.toCompany,
        count: 1,
        personIds: [move.personId],
      });
    }
  }

  const flows = [...flowMap.values()].sort(
    (a, b) => b.count - a.count || a.fromLabel.localeCompare(b.fromLabel)
  );

  return {
    moves,
    flows,
    peopleWithMultipleEmployers,
    method:
      'A move is two consecutive employment rows for the same person with different normalised company keys. Order is started_on, then observed_at, then current flag.',
    limitations: [
      'Most LinkedIn connection exports contain only a current employer, not a full résumé. Moves then appear only across incremental imports.',
      'Title differences without a date are not treated as promotions.',
      'Sharing a company with someone is not evidence that the two people know each other.',
    ],
  };
}

export interface RoleShift {
  fromFamily: string;
  toFamily: string;
  count: number;
}

export function roleTransitions(moves: CareerMove[]): RoleShift[] {
  const map = new Map<string, RoleShift>();
  for (const m of moves) {
    const from = classifyRoleFamily(m.fromTitle);
    const to = classifyRoleFamily(m.toTitle);
    if (!from || !to || from.key === to.key) continue;
    const id = `${from.key}→${to.key}`;
    const existing = map.get(id);
    if (existing) existing.count += 1;
    else map.set(id, { fromFamily: from.label, toFamily: to.label, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function industryTransitions(people: PersonFact[], moves: CareerMove[]): RoleShift[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const map = new Map<string, RoleShift>();
  for (const m of moves) {
    const person = byId.get(m.personId);
    const from = classifyIndustry({ title: m.fromTitle, company: m.fromCompany });
    const to = classifyIndustry({
      observedIndustry: person?.observedIndustry,
      title: m.toTitle,
      company: m.toCompany,
    });
    if (!from || !to || from.key === to.key) continue;
    const id = `${from.key}→${to.key}`;
    const existing = map.get(id);
    if (existing) existing.count += 1;
    else map.set(id, { fromFamily: from.label, toFamily: to.label, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
