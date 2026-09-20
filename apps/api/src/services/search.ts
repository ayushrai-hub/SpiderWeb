import { query } from '@intel/shared';
import type { Row } from './row.js';

export type SearchType = 'person' | 'company' | 'conversation';

export interface SearchHit {
  type: SearchType;
  id: string;
  title: string;
  subtitle: string | null;
  detail: string | null;
  score: number;
}

const DEFAULT_TYPES: SearchType[] = ['person', 'company', 'conversation'];

/**
 * Global search.
 *
 * Ranked full-text over the generated `people.search_document`, with a trigram
 * similarity fallback so typos and partial names still match. Everything is
 * evaluated in Postgres against GIN indexes, and only the requested page is
 * returned.
 */
export async function globalSearch(
  workspaceId: string,
  term: string,
  options: { types?: SearchType[]; limit?: number } = {}
): Promise<{ hits: SearchHit[]; total: number }> {
  const q = term.trim();
  if (!q) return { hits: [], total: 0 };

  const types = options.types?.length ? options.types : DEFAULT_TYPES;
  const limit = Math.min(options.limit ?? 20, 50);
  const like = `%${q}%`;
  const hits: SearchHit[] = [];

  if (types.includes('person')) {
    const rows = await query<Row>(
      `SELECT id, canonical_name, current_title, current_company, location, email,
              GREATEST(
                ts_rank(search_document, plainto_tsquery('simple', $2)),
                similarity(canonical_name, $2),
                CASE WHEN current_company ILIKE $3 THEN 0.35 ELSE 0 END,
                CASE WHEN email = lower($2) THEN 1 ELSE 0 END
              ) AS score
       FROM people
       WHERE workspace_id = $1 AND NOT is_self
         AND (search_document @@ plainto_tsquery('simple', $2)
              OR canonical_name ILIKE $3
              OR current_company ILIKE $3
              OR current_title ILIKE $3
              OR location ILIKE $3
              OR email = lower($2)
              -- Trigram similarity, so a misspelt name still finds the person.
              OR canonical_name % $2
              OR current_company % $2)
       ORDER BY score DESC, canonical_name ASC
       LIMIT $4`,
      [workspaceId, q, like, limit]
    );
    hits.push(
      ...rows.map((r) => ({
        type: 'person' as const,
        id: r.id,
        title: r.canonical_name,
        subtitle: [r.current_title, r.current_company].filter(Boolean).join(' at ') || null,
        detail: r.location ?? null,
        score: Number(r.score),
      }))
    );
  }

  if (types.includes('company')) {
    const rows = await query<Row>(
      `SELECT id, canonical_name, industry, connection_count,
              GREATEST(similarity(canonical_name, $2), CASE WHEN canonical_name ILIKE $3 THEN 0.5 ELSE 0 END) AS score
       FROM companies
       WHERE workspace_id = $1 AND (canonical_name ILIKE $3 OR similarity(canonical_name, $2) > 0.3)
       ORDER BY score DESC, connection_count DESC
       LIMIT $4`,
      [workspaceId, q, like, limit]
    );
    hits.push(
      ...rows.map((r) => ({
        type: 'company' as const,
        id: r.id,
        title: r.canonical_name,
        subtitle: r.industry ?? null,
        detail: `${r.connection_count} connection${r.connection_count === 1 ? '' : 's'}`,
        score: Number(r.score),
      }))
    );
  }

  if (types.includes('conversation')) {
    const rows = await query<Row>(
      `SELECT DISTINCT ON (c.id) c.id, c.title, c.message_count, c.last_message_at, p.canonical_name
       FROM conversations c
       LEFT JOIN people p ON p.id = c.person_id
       JOIN messages m ON m.conversation_id = c.id
       WHERE c.workspace_id = $1 AND (m.content ILIKE $2 OR c.title ILIKE $2 OR p.canonical_name ILIKE $2)
       ORDER BY c.id, c.last_message_at DESC
       LIMIT $3`,
      [workspaceId, like, limit]
    );
    hits.push(
      ...rows.map((r) => ({
        type: 'conversation' as const,
        id: r.id,
        title: r.canonical_name ?? r.title ?? 'Conversation',
        subtitle: `${r.message_count} message${r.message_count === 1 ? '' : 's'}`,
        detail: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
        score: 0.2,
      }))
    );
  }

  hits.sort((a, b) => b.score - a.score);
  return { hits: hits.slice(0, limit), total: hits.length };
}
