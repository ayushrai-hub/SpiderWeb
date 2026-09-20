/**
 * Relationship signals.
 *
 * Every signal below is a deterministic function of imported facts — there is
 * no scoring model and no guesswork. The UI labels each one as either an
 * observed fact (something LinkedIn told us) or a calculated signal (something
 * derived from those facts by a stated rule), and never as an inference about
 * how close a relationship is: a LinkedIn export contains nothing that supports
 * that claim.
 */

export const SIGNALS = {
  recent: {
    label: 'Recently connected',
    kind: 'calculated',
    rule: 'Connected within the last 90 days.',
  },
  long_standing: {
    label: 'Long-standing',
    kind: 'calculated',
    rule: 'Connected more than 5 years ago.',
  },
  dormant: {
    label: 'Older, no recent contact',
    kind: 'calculated',
    rule: 'Connected over 2 years ago, with no message or endorsement in the last year. This is not a measure of relationship strength.',
  },
  engaged: {
    label: 'Engaged',
    kind: 'observed',
    rule: 'You have exchanged messages or endorsements.',
  },
  changed_company: {
    label: 'Changed company',
    kind: 'observed',
    rule: 'A later import showed a different current employer.',
  },
  shared_company: {
    label: 'Shared employer',
    kind: 'observed',
    rule: 'Worked at a company you have also worked at.',
  },
  shared_school: {
    label: 'Shared school',
    kind: 'observed',
    rule: 'Attended a school you also attended.',
  },
  no_company: {
    label: 'No employer recorded',
    kind: 'observed',
    rule: 'The export listed no company for this person.',
  },
} as const;

export type SignalKey = keyof typeof SIGNALS;

export const SIGNAL_KEYS = Object.keys(SIGNALS) as SignalKey[];

export function isSignalKey(value: string): value is SignalKey {
  return value in SIGNALS;
}

/**
 * Parameter references for the archive owner's own companies and schools.
 *
 * These are functions rather than strings so a caller building a query
 * incrementally can bind them only for the signals it actually uses: Postgres
 * rejects a statement that binds a parameter it never references.
 */
export interface SignalParams {
  companies(): string;
  schools(): string;
}

export function fixedParams(companies: string, schools: string): SignalParams {
  return { companies: () => companies, schools: () => schools };
}

/** SQL boolean expression for one signal, against an aliased `people` row. */
export function signalExpression(key: SignalKey, alias: string, params: SignalParams): string {
  return buildAll(alias, params)[key];
}

/** All signal expressions. Binds both owner parameters. */
export function signalSql(
  alias: string,
  selfCompanies: string,
  selfSchools: string
): Record<SignalKey, string> {
  return buildAll(alias, fixedParams(selfCompanies, selfSchools));
}

function buildAll(alias: string, params: SignalParams): Record<SignalKey, string> {
  return {
    recent: `${alias}.connected_at >= now() - interval '90 days'`,
    long_standing: `${alias}.connected_at <= now() - interval '5 years'`,
    dormant: `${alias}.connected_at <= now() - interval '2 years'
              AND (${alias}.last_interaction_at IS NULL OR ${alias}.last_interaction_at <= now() - interval '1 year')`,
    engaged: `${alias}.interaction_count > 0`,
    changed_company: `EXISTS (
      SELECT 1 FROM person_employment e
      WHERE e.person_id = ${alias}.id AND e.company_key IS NOT NULL
      GROUP BY e.person_id HAVING count(DISTINCT e.company_key) > 1
    )`,
    get shared_company() {
      return `EXISTS (
      SELECT 1 FROM person_employment e
      WHERE e.person_id = ${alias}.id AND e.company_key = ANY(${params.companies()})
    )`;
    },
    get shared_school() {
      return `EXISTS (
      SELECT 1 FROM education ed
      WHERE ed.person_id = ${alias}.id AND lower(ed.school_name) = ANY(${params.schools()})
    )`;
    },
    no_company: `${alias}.current_company IS NULL`,
  };
}
