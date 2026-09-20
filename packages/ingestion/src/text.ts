/**
 * Normalisation primitives shared by every LinkedIn adapter.
 *
 * All of these are pure and total: they never throw and always return a
 * predictable value for junk input, because a single malformed row must not be
 * able to abort an import.
 */

/** Collapse whitespace, strip zero-width and control characters, trim. */
export function clean(value: unknown): string {
  if (value === null || value === undefined) return '';
  return (
    String(value)
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      // Zero-width characters and BOM that LinkedIn sometimes embeds in names.
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Non-breaking and other exotic spaces, normalised to a plain space.
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** `clean`, but returns undefined for empty / placeholder values. */
export function cleanOptional(value: unknown): string | undefined {
  const v = clean(value);
  if (!v) return undefined;
  const lower = v.toLowerCase();
  if (lower === 'n/a' || lower === 'na' || lower === 'null' || lower === 'undefined' || lower === '-') {
    return undefined;
  }
  return v;
}

/** Lowercased, punctuation-free comparison key. */
export function comparisonKey(value: unknown): string {
  return clean(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeName(value: unknown): string {
  return clean(value).replace(/\s*,\s*$/, '');
}

export function fullName(first: unknown, last: unknown): string {
  return normalizeName([clean(first), clean(last)].filter(Boolean).join(' '));
}

const LINKEDIN_HOSTS = /(^|\.)linkedin\.com$/i;

/**
 * Canonical LinkedIn profile URL, or undefined when the input is not one.
 * Strips query strings, trailing slashes, locale subdomains and casing so the
 * same person exported twice produces one identity.
 */
export function normalizeProfileUrl(value: unknown): string | undefined {
  const raw = clean(value);
  if (!raw) return undefined;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return undefined;
  }
  if (!LINKEDIN_HOSTS.test(url.hostname)) return undefined;
  const match = url.pathname.match(/\/(?:in|pub)\/([^/]+)/i);
  if (!match) return undefined;
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    slug = match[1];
  }
  slug = slug.toLowerCase().replace(/\/+$/, '');
  if (!slug) return undefined;
  return `https://www.linkedin.com/in/${slug}`;
}

/** The `/in/<slug>` handle, used as the strongest identity signal. */
export function profileSlug(value: unknown): string | undefined {
  const url = normalizeProfileUrl(value);
  return url ? url.slice('https://www.linkedin.com/in/'.length) : undefined;
}

export function normalizeCompanyUrl(value: unknown): string | undefined {
  const raw = clean(value);
  if (!raw) return undefined;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (!LINKEDIN_HOSTS.test(url.hostname)) return undefined;
    const match = url.pathname.match(/\/(?:company|school|showcase)\/([^/]+)/i);
    if (!match) return undefined;
    return `https://www.linkedin.com/company/${match[1].toLowerCase()}`;
  } catch {
    return undefined;
  }
}

export function normalizeEmail(value: unknown): string | undefined {
  const raw = clean(value).toLowerCase();
  if (!raw) return undefined;
  // Deliberately permissive: LinkedIn exports contain plus-addressing and
  // unicode domains. Reject only things that clearly are not addresses.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw)) return undefined;
  return raw;
}

export function normalizePhone(value: unknown): string | undefined {
  const raw = clean(value);
  if (!raw) return undefined;
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.replace(/\D/g, '').length < 6) return undefined;
  return digits;
}

/** Legal-suffix and punctuation stripping so "Acme, Inc." == "Acme Inc" == "Acme". */
const COMPANY_SUFFIXES = new Set([
  'inc',
  'inc.',
  'llc',
  'l.l.c',
  'ltd',
  'ltd.',
  'limited',
  'plc',
  'gmbh',
  'ag',
  'sa',
  's.a',
  'bv',
  'b.v',
  'nv',
  'n.v',
  'pty',
  'pte',
  'co',
  'co.',
  'corp',
  'corp.',
  'corporation',
  'company',
  'group',
  'holdings',
  'llp',
  'lp',
  'srl',
  's.r.l',
  'oy',
  'ab',
  'as',
  'aps',
  'kk',
  'sas',
  'sarl',
  'spa',
  's.p.a',
  'private',
  'pvt',
]);

export function normalizeCompanyName(value: unknown): string | undefined {
  const raw = cleanOptional(value);
  if (!raw) return undefined;
  // Drop a trailing parenthetical qualifier: "Acme (formerly Widgets)".
  return raw.replace(/\s*\([^)]*\)\s*$/, '').trim() || raw;
}

/** Key used to decide whether two company strings are the same company. */
export function companyKey(value: unknown): string {
  const base = comparisonKey(normalizeCompanyName(value) ?? '');
  if (!base) return '';
  const words = base.split(' ').filter(Boolean);
  while (words.length > 1 && COMPANY_SUFFIXES.has(words[words.length - 1])) {
    words.pop();
  }
  return words.join(' ');
}

export function normalizeTitle(value: unknown): string | undefined {
  const raw = cleanOptional(value);
  if (!raw) return undefined;
  return raw.replace(/\s*[-–—|]\s*$/, '').trim() || undefined;
}

export function normalizeLocation(value: unknown): string | undefined {
  const raw = cleanOptional(value);
  if (!raw) return undefined;
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

export function normalizeSchool(value: unknown): string | undefined {
  return cleanOptional(value);
}

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

/**
 * Parse the date shapes LinkedIn actually emits, as a UTC instant:
 *   "2024-03-05", "2024-03-05 14:22:01 UTC", "05 Mar 2024", "Mar 2024",
 *   "March 5, 2024", "2024", "3/5/2024", epoch milliseconds.
 * Returns null when the value is absent or unparseable — never a bogus date.
 */
export function parseDate(value: unknown): Date | null {
  const raw = clean(value);
  if (!raw) return null;

  // Epoch milliseconds (LinkedIn uses these in a few JSON exports).
  if (/^\d{13}$/.test(raw)) {
    const d = new Date(Number(raw));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{10}$/.test(raw)) {
    const d = new Date(Number(raw) * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // ISO-ish: 2024-03-05 [14:22:01[ UTC]]
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const [, y, m, d, hh, mm, ss] = iso;
    return utc(Number(y), Number(m) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0), Number(ss ?? 0));
  }

  // "05 Mar 2024" / "5 March 2024"
  const dmy = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/);
  if (dmy && MONTHS[dmy[2].toLowerCase()] !== undefined) {
    return utc(Number(dmy[3]), MONTHS[dmy[2].toLowerCase()], Number(dmy[1]));
  }

  // "Mar 5, 2024" / "March 5 2024"
  const mdy = raw.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdy && MONTHS[mdy[1].toLowerCase()] !== undefined) {
    return utc(Number(mdy[3]), MONTHS[mdy[1].toLowerCase()], Number(mdy[2]));
  }

  // "Mar 2024" — month precision, normalised to the 1st.
  const my = raw.match(/^([A-Za-z]{3,})\.?\s+(\d{4})$/);
  if (my && MONTHS[my[1].toLowerCase()] !== undefined) {
    return utc(Number(my[2]), MONTHS[my[1].toLowerCase()], 1);
  }

  // "2024" — year precision.
  if (/^\d{4}$/.test(raw)) {
    const year = Number(raw);
    if (year >= 1900 && year <= 2200) return utc(year, 0, 1);
  }

  // "3/5/2024" — ambiguous; LinkedIn emits US order in the locales that use it.
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = Number(slash[3]);
    // If the first component cannot be a month, treat it as the day.
    const [month, day] = a > 12 ? [b, a] : [a, b];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return utc(year, month - 1, day);
  }

  return null;
}

function utc(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): Date | null {
  const date = new Date(Date.UTC(y, m, d, hh, mm, ss));
  if (Number.isNaN(date.getTime())) return null;
  // Guard against rollover (e.g. Feb 31 -> Mar 3) producing a wrong date.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m) return null;
  return date;
}

/** `YYYY-MM-DD` for a `date` column, or null. */
export function toDateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export function parseCount(value: unknown): number {
  const n = Number.parseInt(clean(value).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Truncate for storage while keeping whole characters. */
export function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}
