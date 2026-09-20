import { keyOf } from './stats.js';
import type { ImportFact, PersonFact } from './types.js';

export interface FieldChange {
  personId: string;
  name: string;
  field: 'company' | 'title' | 'location';
  from: string;
  to: string;
}

export interface ChangeReport {
  comparedImports: { previous: ImportFact | null; current: ImportFact | null };
  newConnections: { personId: string; name: string }[];
  notSeenInLatestConnectionsImport: { personId: string; name: string }[];
  companyChanges: FieldChange[];
  titleChanges: FieldChange[];
  newCompanies: string[];
  companiesNoLongerCurrent: string[];
  limitations: string[];
  method: string;
}

/**
 * Compare the latest Connections.csv import with the previous one using
 * first_import_id / last_import_id and current vs former employment.
 *
 * People absent from the latest connections import are "not seen", not
 * proven deleted — LinkedIn may omit a row for other reasons.
 */
export function detectChanges(
  people: PersonFact[],
  imports: ImportFact[],
  _currentCompanies: { key: string; name: string; currentCount: number }[]
): ChangeReport {
  const connectionImports = imports
    .filter((i) => i.hadConnections && (i.status === 'completed' || i.status === 'partially_completed'))
    .sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime());

  const current = connectionImports[connectionImports.length - 1] ?? null;
  const previous = connectionImports.length >= 2 ? connectionImports[connectionImports.length - 2] : null;

  const limitations: string[] = [];
  if (!current) {
    limitations.push('No import that contained Connections.csv, so a change report cannot be produced.');
  } else if (!previous) {
    limitations.push('Only one connections import is on file. New vs previous requires a later export.');
  }

  const newConnections = current
    ? people.filter((p) => p.firstImportId === current.id).map((p) => ({ personId: p.id, name: p.name }))
    : [];

  const notSeen =
    current && previous
      ? people
          .filter((p) => p.lastImportId && p.lastImportId !== current.id)
          .map((p) => ({ personId: p.id, name: p.name }))
      : [];

  if (current && previous) {
    limitations.push(
      'People not present in the latest Connections.csv are listed as not seen in that import. That is not proof they were removed from LinkedIn.'
    );
  }

  const companyChanges: FieldChange[] = [];
  const titleChanges: FieldChange[] = [];
  // Employment-driven changes are supplied by the caller via people whose
  // current employer differs from a former row — handled in report.ts.

  const newCompanies: string[] = [];
  const companiesNoLongerCurrent: string[] = [];

  return {
    comparedImports: { previous, current },
    newConnections,
    notSeenInLatestConnectionsImport: notSeen,
    companyChanges,
    titleChanges,
    newCompanies,
    companiesNoLongerCurrent,
    limitations,
    method:
      'New connections: first_import_id equals the latest Connections.csv import. Not-seen: last_import_id is an earlier connections import.',
  };
}

export function employmentChanges(
  _people: PersonFact[],
  moves: {
    personId: string;
    name: string;
    fromCompany: string;
    toCompany: string;
    fromTitle: string | null;
    toTitle: string | null;
  }[]
): Pick<ChangeReport, 'companyChanges' | 'titleChanges'> {
  const companyChanges: FieldChange[] = moves.map((m) => ({
    personId: m.personId,
    name: m.name,
    field: 'company',
    from: m.fromCompany,
    to: m.toCompany,
  }));
  const titleChanges: FieldChange[] = [];
  const seen = new Set<string>();
  for (const m of moves) {
    if (!m.fromTitle || !m.toTitle) continue;
    if (keyOf(m.fromTitle) === keyOf(m.toTitle)) continue;
    const id = `${m.personId}:${m.fromTitle}:${m.toTitle}`;
    if (seen.has(id)) continue;
    seen.add(id);
    titleChanges.push({
      personId: m.personId,
      name: m.name,
      field: 'title',
      from: m.fromTitle,
      to: m.toTitle,
    });
  }
  return { companyChanges, titleChanges };
}
