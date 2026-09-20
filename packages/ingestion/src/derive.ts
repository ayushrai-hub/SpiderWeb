import type { Sql } from 'postgres';

export interface DerivationStats {
  employmentLinked: number;
  companiesScored: number;
  peopleScored: number;
  careerMovesObserved: number;
}

/**
 * Recompute everything derived from imported facts.
 *
 * Runs after every import and can be re-run on demand. Each step is a full
 * recomputation from stored rows rather than an increment, so running it twice
 * produces the same result — no counter can drift.
 */
export async function deriveIntelligence(sql: Sql, workspaceId: string): Promise<DerivationStats> {
  // 1. Attach employment rows to their company. The join uses the normalised
  //    key the pipeline computed, so the matching rules live in exactly one
  //    place (packages/ingestion/src/text.ts).
  const linked = await sql<{ id: string }[]>`
    UPDATE person_employment e
    SET company_id = c.id
    FROM companies c
    WHERE e.workspace_id = ${workspaceId}
      AND e.company_id IS NULL
      AND e.company_key IS NOT NULL
      AND c.workspace_id = e.workspace_id
      AND c.normalized_name = e.company_key
    RETURNING e.id
  `;

  // 2. A Connections.csv row is a point-in-time snapshot with no date range.
  //    Only the most recently observed snapshot per person stays "current";
  //    older ones become history, which is what makes a job change visible
  //    across incremental imports.
  await sql`
    UPDATE person_employment e
    SET is_current = false
    FROM (
      SELECT person_id, max(observed_at) AS latest
      FROM person_employment
      WHERE workspace_id = ${workspaceId} AND start_date IS NULL AND end_date IS NULL
      GROUP BY person_id
    ) t
    WHERE e.workspace_id = ${workspaceId}
      AND e.person_id = t.person_id
      AND e.start_date IS NULL AND e.end_date IS NULL
      AND e.observed_at < t.latest
      AND e.is_current
  `;

  // 3. The archive owner's current role comes from Positions.csv, not from a
  //    connection snapshot.
  await sql`
    UPDATE people p
    SET current_company = e.company_name,
        current_title   = e.title,
        updated_at      = now()
    FROM (
      SELECT DISTINCT ON (person_id) person_id, company_name, title
      FROM person_employment
      WHERE workspace_id = ${workspaceId} AND is_current
      ORDER BY person_id, started_on DESC NULLS LAST, observed_at DESC
    ) e
    WHERE p.id = e.person_id AND p.workspace_id = ${workspaceId} AND p.is_self
  `;

  // 4. Connection date is denormalised onto the person so list queries and
  //    "dormant" filters need only one table.
  await sql`
    UPDATE people p
    SET connected_at = c.connected_at
    FROM connections c
    WHERE c.workspace_id = ${workspaceId}
      AND c.person_id = p.id
      AND c.connected_at IS NOT NULL
      AND p.connected_at IS DISTINCT FROM c.connected_at
  `;

  // 5. Interaction recency and volume, recomputed from messages plus recorded
  //    touchpoints. Everyone is reset first so people who lost their last
  //    interaction (because an import was deleted) are corrected too.
  await sql`
    UPDATE people SET interaction_count = 0, last_interaction_at = NULL
    WHERE workspace_id = ${workspaceId} AND (interaction_count <> 0 OR last_interaction_at IS NOT NULL)
  `;
  await sql`
    UPDATE people p
    SET interaction_count   = t.total,
        last_interaction_at = t.last_at
    FROM (
      SELECT person_id, sum(hits)::int AS total, max(last_at) AS last_at
      FROM (
        SELECT c.person_id, count(m.id) AS hits, max(m.sent_at) AS last_at
        FROM conversations c
        JOIN messages m ON m.conversation_id = c.id
        WHERE c.workspace_id = ${workspaceId} AND c.person_id IS NOT NULL
        GROUP BY c.person_id
        UNION ALL
        SELECT person_id, count(*) AS hits, max(occurred_at) AS last_at
        FROM person_interactions
        WHERE workspace_id = ${workspaceId}
        GROUP BY person_id
      ) s
      GROUP BY person_id
    ) t
    WHERE p.id = t.person_id AND p.workspace_id = ${workspaceId}
  `;

  // 6. Company rollups. Self is excluded so "12 connections at Acme" means
  //    twelve other people, not eleven plus you.
  const scored = await sql<{ id: string }[]>`
    UPDATE companies c
    SET connection_count = t.total,
        current_count    = t.current_total,
        former_count     = t.former_total,
        updated_at       = now()
    FROM (
      SELECT co.id,
             count(DISTINCT e.person_id)::int                                 AS total,
             count(DISTINCT e.person_id) FILTER (WHERE e.is_current)::int     AS current_total,
             count(DISTINCT e.person_id) FILTER (WHERE NOT e.is_current)::int AS former_total
      FROM companies co
      LEFT JOIN person_employment e
             ON e.company_id = co.id
            AND e.workspace_id = co.workspace_id
      LEFT JOIN people p
             ON p.id = e.person_id
      WHERE co.workspace_id = ${workspaceId}
        AND (e.id IS NULL OR p.is_self = false)
      GROUP BY co.id
    ) t
    WHERE c.id = t.id
      AND (c.connection_count, c.current_count, c.former_count)
          IS DISTINCT FROM (t.total, t.current_total, t.former_total)
    RETURNING c.id
  `;

  const [moves] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM (
      SELECT person_id
      FROM person_employment
      WHERE workspace_id = ${workspaceId} AND company_key IS NOT NULL
      GROUP BY person_id
      HAVING count(DISTINCT company_key) > 1
    ) t
  `;

  const [peopleCount] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM people WHERE workspace_id = ${workspaceId}
  `;

  return {
    employmentLinked: linked.length,
    companiesScored: scored.length,
    peopleScored: peopleCount?.count ?? 0,
    careerMovesObserved: moves?.count ?? 0,
  };
}
