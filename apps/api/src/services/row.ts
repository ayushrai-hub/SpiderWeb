/**
 * A row returned by a raw SQL query.
 *
 * The driver types column values at runtime (dates become `Date`, numerics
 * become `number`, jsonb becomes an object) and each query selects a different
 * shape, so the alternative is either a hand-written interface per query —
 * which drifts from the SQL silently — or `unknown` plus a cast at every field
 * access. Both are worse than one documented escape hatch that every mapper
 * immediately converts into a typed result object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
