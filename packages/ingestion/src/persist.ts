import type { Sql } from 'postgres';
import { comparisonKey, companyKey, profileSlug, truncate } from './text.js';
import { SELF_KEY, type CanonicalPerson, type NormalizationResult } from './normalize.js';

export interface PersistStats {
  peopleCreated: number;
  peopleUpdated: number;
  connectionsCreated: number;
  connectionsUpdated: number;
  companiesCreated: number;
  employmentCreated: number;
  educationCreated: number;
  skillsCreated: number;
  conversationsCreated: number;
  messagesCreated: number;
  activitiesCreated: number;
  jobsCreated: number;
  duplicatesSkipped: number;
}

export function emptyStats(): PersistStats {
  return {
    peopleCreated: 0,
    peopleUpdated: 0,
    connectionsCreated: 0,
    connectionsUpdated: 0,
    companiesCreated: 0,
    employmentCreated: 0,
    educationCreated: 0,
    skillsCreated: 0,
    conversationsCreated: 0,
    messagesCreated: 0,
    activitiesCreated: 0,
    jobsCreated: 0,
    duplicatesSkipped: 0,
  };
}

const CHUNK = 400;

function chunked<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface UpsertSpec {
  table: string;
  columns: string[];
  /** Conflict target, e.g. `(workspace_id, dedupe_key)`. */
  conflict: string;
  /** `DO UPDATE SET ...` body, or null for `DO NOTHING`. */
  update: string | null;
  /** Extra columns to return alongside the created/updated flag. */
  returning?: string[];
}

interface UpsertRow {
  inserted: boolean;
  [key: string]: unknown;
}

/**
 * Parameterised multi-row upsert. Values are bound by the driver, never
 * interpolated; only the table/column names — all compile-time constants in
 * this module — appear in the SQL text.
 *
 * `xmax = 0` is true only for rows the statement inserted, which is how
 * created-versus-updated counts stay accurate.
 */
async function upsert(sql: Sql, spec: UpsertSpec, rows: Record<string, unknown>[]): Promise<UpsertRow[]> {
  if (rows.length === 0) return [];
  const cols = spec.columns;
  const extra = spec.returning ?? [];
  const out: UpsertRow[] = [];

  for (const batch of chunked(rows)) {
    const tuples = batch
      .map((_, r) => `(${cols.map((__, c) => `$${r * cols.length + c + 1}`).join(', ')})`)
      .join(', ');
    const text = `
      INSERT INTO ${spec.table} (${cols.join(', ')})
      VALUES ${tuples}
      ON CONFLICT ${spec.conflict} ${spec.update ? `DO UPDATE SET ${spec.update}` : 'DO NOTHING'}
      RETURNING (xmax = 0) AS inserted${extra.length ? `, ${extra.join(', ')}` : ''}
    `;
    const params = batch.flatMap((row) => cols.map((c) => row[c] ?? null));
    const result = await sql.unsafe(text, params as never[]);
    out.push(...(result as unknown as UpsertRow[]));
  }
  return out;
}

/** Drop rows that would collide with each other inside a single statement. */
function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export interface PersistContext {
  sql: Sql;
  workspaceId: string;
  importId: string;
}

/**
 * Write a normalisation result into the database.
 *
 * Idempotency: every table written here has a deterministic unique key and
 * every write is an upsert against it, so re-importing the same archive
 * updates rows in place rather than duplicating them. User-authored data
 * (person_notes, person_tags) is never read or written by this function.
 */
export async function persist(ctx: PersistContext, result: NormalizationResult): Promise<PersistStats> {
  const stats = emptyStats();
  const { sql, workspaceId, importId } = ctx;

  // -- Companies ----------------------------------------------------------
  const companyIdByKey = new Map<string, string>();
  const companyResult = await upsert(
    sql,
    {
      table: 'companies',
      columns: [
        'workspace_id',
        'canonical_name',
        'normalized_name',
        'linkedin_url',
        'industry',
        'source_type',
      ],
      conflict: '(workspace_id, normalized_name)',
      update: `
        canonical_name = COALESCE(NULLIF(EXCLUDED.canonical_name, ''), companies.canonical_name),
        linkedin_url   = COALESCE(EXCLUDED.linkedin_url, companies.linkedin_url),
        industry       = COALESCE(EXCLUDED.industry, companies.industry),
        updated_at     = now()`,
      returning: ['id', 'normalized_name'],
    },
    [...result.companies.values()].map((c) => ({
      workspace_id: workspaceId,
      canonical_name: truncate(c.name, 300),
      normalized_name: c.key,
      linkedin_url: c.linkedinUrl ?? null,
      industry: c.industry ?? null,
      source_type: 'linkedin',
    }))
  );
  for (const row of companyResult) {
    companyIdByKey.set(row.normalized_name as string, row.id as string);
    if (row.inserted) stats.companiesCreated++;
  }

  // -- People -------------------------------------------------------------
  // The archive owner keys off their profile URL when known so repeat imports
  // reuse the same row; otherwise a reserved literal key.
  const selfSlug = profileSlug(result.self?.profileUrl);
  const selfKey = selfSlug ? `url:${selfSlug}` : 'self';
  const resolveKey = (key: string): string => (key === SELF_KEY ? selfKey : key);

  const peopleToWrite: CanonicalPerson[] = [...result.people.values()].map((p) =>
    p.key === SELF_KEY ? { ...p, key: selfKey } : p
  );
  if (result.self && !result.people.has(SELF_KEY)) {
    peopleToWrite.push({ ...result.self, key: selfKey });
  }

  // Weak identities (name-only, from datasets without profile URLs) are
  // matched against people already stored from earlier imports, so a second
  // import does not create a shadow copy of someone who is already known.
  // Only an unambiguous single name match is accepted.
  const keyRemap = await resolveWeakIdentitiesAgainstDatabase(sql, workspaceId, peopleToWrite);
  const applyRemap = (key: string): string => keyRemap.get(key) ?? key;
  if (keyRemap.size > 0) {
    for (const p of peopleToWrite) p.key = applyRemap(p.key);
  }

  const personIdByKey = new Map<string, string>();
  const peopleResult = await upsert(
    sql,
    {
      table: 'people',
      columns: [
        'workspace_id',
        'dedupe_key',
        'canonical_name',
        'first_name',
        'last_name',
        'headline',
        'location',
        'industry',
        'profile_url',
        'email',
        'current_company',
        'current_title',
        'connected_at',
        'is_self',
        'confidence',
        'source_type',
        'first_import_id',
        'last_import_id',
      ],
      conflict: '(workspace_id, dedupe_key)',
      update: `
        canonical_name  = COALESCE(NULLIF(EXCLUDED.canonical_name, ''), people.canonical_name),
        first_name      = COALESCE(EXCLUDED.first_name, people.first_name),
        last_name       = COALESCE(EXCLUDED.last_name, people.last_name),
        headline        = COALESCE(EXCLUDED.headline, people.headline),
        location        = COALESCE(EXCLUDED.location, people.location),
        industry        = COALESCE(EXCLUDED.industry, people.industry),
        profile_url     = COALESCE(EXCLUDED.profile_url, people.profile_url),
        email           = COALESCE(EXCLUDED.email, people.email),
        current_company = COALESCE(EXCLUDED.current_company, people.current_company),
        current_title   = COALESCE(EXCLUDED.current_title, people.current_title),
        connected_at    = COALESCE(people.connected_at, EXCLUDED.connected_at),
        is_self         = people.is_self OR EXCLUDED.is_self,
        confidence      = GREATEST(people.confidence, EXCLUDED.confidence),
        last_import_id  = EXCLUDED.last_import_id,
        updated_at      = now()`,
      returning: ['id', 'dedupe_key'],
    },
    dedupe(peopleToWrite, (p) => p.key).map((p) => ({
      workspace_id: workspaceId,
      dedupe_key: p.key,
      canonical_name: truncate(p.fullName, 300),
      first_name: p.firstName ?? null,
      last_name: p.lastName ?? null,
      headline: p.headline ? truncate(p.headline, 500) : null,
      location: p.location ?? null,
      industry: p.industry ?? null,
      profile_url: p.profileUrl ?? null,
      email: p.email ?? null,
      current_company: p.currentCompany ? truncate(p.currentCompany, 300) : null,
      current_title: p.currentTitle ? truncate(p.currentTitle, 300) : null,
      connected_at: p.connectedAt ?? null,
      is_self: p.isSelf,
      confidence: p.confidence,
      source_type: 'linkedin',
      first_import_id: importId,
      last_import_id: importId,
    }))
  );
  for (const row of peopleResult) {
    personIdByKey.set(row.dedupe_key as string, row.id as string);
    if (row.inserted) stats.peopleCreated++;
    else stats.peopleUpdated++;
  }

  const selfPersonId = personIdByKey.get(selfKey) ?? null;
  const personId = (key: string): string | undefined => personIdByKey.get(applyRemap(resolveKey(key)));

  // -- Connections --------------------------------------------------------
  const connectionRows = dedupe(
    result.connections.filter((c) => personId(c.personKey)),
    (c) => personId(c.personKey)!
  ).map((c) => ({
    workspace_id: workspaceId,
    person_id: personId(c.personKey)!,
    import_id: importId,
    connected_at: c.connectedAt ?? null,
    source_file: c.sourceFile,
    status: c.status,
  }));
  const connectionResult = await upsert(
    sql,
    {
      table: 'connections',
      columns: ['workspace_id', 'person_id', 'import_id', 'connected_at', 'source_file', 'status'],
      conflict: '(workspace_id, person_id)',
      update: `
        connected_at = COALESCE(connections.connected_at, EXCLUDED.connected_at),
        source_file  = EXCLUDED.source_file,
        status       = EXCLUDED.status`,
    },
    connectionRows
  );
  for (const row of connectionResult) {
    if (row.inserted) stats.connectionsCreated++;
    else {
      stats.connectionsUpdated++;
      stats.duplicatesSkipped++;
    }
  }

  // -- Employment ---------------------------------------------------------
  const employmentRows = dedupe(
    result.employment.filter((e) => personId(e.personKey)),
    (e) =>
      `${personId(e.personKey)}|${comparisonKey(e.companyName ?? '')}|${comparisonKey(e.title ?? '')}|${e.startDate ?? ''}`
  ).map((e) => {
    const ckey = companyKey(e.companyName);
    return {
      workspace_id: workspaceId,
      person_id: personId(e.personKey)!,
      company_id: ckey ? (companyIdByKey.get(ckey) ?? null) : null,
      company_key: ckey || null,
      company_name: e.companyName ? truncate(e.companyName, 300) : null,
      title: e.title ? truncate(e.title, 300) : null,
      description: e.description ? truncate(e.description, 4000) : null,
      start_date: e.startDate ?? null,
      end_date: e.endDate ?? null,
      started_on: e.startedOn,
      ended_on: e.endedOn,
      is_current: e.isCurrent,
      source_file: e.sourceFile,
      observed_at: new Date(),
    };
  });
  const employmentResult = await upsert(
    sql,
    {
      table: 'person_employment',
      columns: [
        'workspace_id',
        'person_id',
        'company_id',
        'company_key',
        'company_name',
        'title',
        'description',
        'start_date',
        'end_date',
        'started_on',
        'ended_on',
        'is_current',
        'source_file',
        'observed_at',
      ],
      conflict: `(person_id, lower(coalesce(company_name, '')), lower(coalesce(title, '')), coalesce(start_date, ''))`,
      update: `
        company_id  = COALESCE(EXCLUDED.company_id, person_employment.company_id),
        company_key = COALESCE(EXCLUDED.company_key, person_employment.company_key),
        description = COALESCE(EXCLUDED.description, person_employment.description),
        end_date    = COALESCE(EXCLUDED.end_date, person_employment.end_date),
        ended_on    = COALESCE(EXCLUDED.ended_on, person_employment.ended_on),
        is_current  = EXCLUDED.is_current,
        observed_at = now()`,
    },
    employmentRows
  );
  for (const row of employmentResult) if (row.inserted) stats.employmentCreated++;

  // -- Education ----------------------------------------------------------
  const educationResult = await upsert(
    sql,
    {
      table: 'education',
      columns: [
        'workspace_id',
        'person_id',
        'school_name',
        'degree',
        'field_of_study',
        'start_date',
        'end_date',
        'source_file',
      ],
      conflict: `(person_id, lower(coalesce(school_name, '')), lower(coalesce(degree, '')), lower(coalesce(field_of_study, '')))`,
      update: `
        start_date = COALESCE(EXCLUDED.start_date, education.start_date),
        end_date   = COALESCE(EXCLUDED.end_date, education.end_date)`,
    },
    dedupe(
      result.education.filter((e) => personId(e.personKey)),
      (e) =>
        `${personId(e.personKey)}|${comparisonKey(e.schoolName)}|${comparisonKey(e.degree ?? '')}|${comparisonKey(e.fieldOfStudy ?? '')}`
    ).map((e) => ({
      workspace_id: workspaceId,
      person_id: personId(e.personKey)!,
      school_name: truncate(e.schoolName, 300),
      degree: e.degree ? truncate(e.degree, 300) : null,
      field_of_study: e.fieldOfStudy ? truncate(e.fieldOfStudy, 300) : null,
      start_date: e.startDate ?? null,
      end_date: e.endDate ?? null,
      source_file: e.sourceFile,
    }))
  );
  for (const row of educationResult) if (row.inserted) stats.educationCreated++;

  // -- Skills -------------------------------------------------------------
  const skillResult = await upsert(
    sql,
    {
      table: 'skills',
      columns: ['workspace_id', 'person_id', 'name', 'endorsement_count', 'source_file'],
      conflict: '(person_id, lower(name))',
      update: 'endorsement_count = skills.endorsement_count + EXCLUDED.endorsement_count',
    },
    aggregateSkills(result, personId, workspaceId)
  );
  for (const row of skillResult) if (row.inserted) stats.skillsCreated++;

  // -- Emails / phones / profile fields -----------------------------------
  await upsert(
    sql,
    {
      table: 'emails',
      columns: ['workspace_id', 'person_id', 'email', 'is_primary', 'source_file'],
      conflict: '(person_id, lower(email))',
      update: 'is_primary = emails.is_primary OR EXCLUDED.is_primary',
    },
    dedupe(
      result.emails.filter((e) => personId(e.personKey)),
      (e) => `${personId(e.personKey)}|${e.value.toLowerCase()}`
    ).map((e) => ({
      workspace_id: workspaceId,
      person_id: personId(e.personKey)!,
      email: e.value,
      is_primary: e.isPrimary,
      source_file: e.sourceFile,
    }))
  );

  await upsert(
    sql,
    {
      table: 'phone_numbers',
      columns: ['workspace_id', 'person_id', 'phone_number', 'type', 'source_file'],
      conflict: '(person_id, phone_number)',
      update: 'type = COALESCE(EXCLUDED.type, phone_numbers.type)',
    },
    dedupe(
      result.phones.filter((p) => personId(p.personKey)),
      (p) => `${personId(p.personKey)}|${p.value}`
    ).map((p) => ({
      workspace_id: workspaceId,
      person_id: personId(p.personKey)!,
      phone_number: p.value,
      type: p.type ?? null,
      source_file: p.sourceFile,
    }))
  );

  await upsert(
    sql,
    {
      table: 'person_profiles',
      columns: ['workspace_id', 'person_id', 'field_name', 'field_value', 'source_file', 'observed_at'],
      conflict: '(person_id, field_name)',
      update: 'field_value = EXCLUDED.field_value, observed_at = now()',
    },
    dedupe(
      result.profileFields.filter((f) => personId(f.personKey)),
      (f) => `${personId(f.personKey)}|${f.fieldName}`
    ).map((f) => ({
      workspace_id: workspaceId,
      person_id: personId(f.personKey)!,
      field_name: f.fieldName,
      field_value: f.fieldValue,
      source_file: f.sourceFile,
      observed_at: new Date(),
    }))
  );

  // -- Conversations and messages -----------------------------------------
  if (result.conversations.size > 0) {
    const conversations = [...result.conversations.values()];
    const counterpartIds = await resolveCounterparts(sql, workspaceId, conversations, personIdByKey);

    const conversationResult = await upsert(
      sql,
      {
        table: 'conversations',
        columns: ['workspace_id', 'external_id', 'person_id', 'title', 'source_type'],
        conflict: '(workspace_id, external_id)',
        update: `
          person_id = COALESCE(conversations.person_id, EXCLUDED.person_id),
          title     = COALESCE(conversations.title, EXCLUDED.title)`,
        returning: ['id', 'external_id'],
      },
      conversations.map((c) => ({
        workspace_id: workspaceId,
        external_id: c.externalId,
        person_id: counterpartIds.get(c.externalId) ?? null,
        title: c.title ? truncate(c.title, 300) : null,
        source_type: 'linkedin',
      }))
    );
    const convIdByExternal = new Map<string, string>();
    for (const row of conversationResult) {
      convIdByExternal.set(row.external_id as string, row.id as string);
      if (row.inserted) stats.conversationsCreated++;
    }

    const messageRows = dedupe(
      result.messages.filter((m) => convIdByExternal.has(m.conversationExternalId)),
      (m) => m.externalId
    ).map((m) => ({
      workspace_id: workspaceId,
      conversation_id: convIdByExternal.get(m.conversationExternalId)!,
      external_id: m.externalId,
      sender_id:
        m.direction === 'outbound' ? selfPersonId : (counterpartIds.get(m.conversationExternalId) ?? null),
      sender_name: m.senderName ?? null,
      recipient_name: m.recipientName ?? null,
      subject: m.subject ? truncate(m.subject, 500) : null,
      content: m.content,
      sent_at: m.sentAt ?? null,
      direction: m.direction,
      source_file: m.sourceFile,
    }));
    const messageResult = await upsert(
      sql,
      {
        table: 'messages',
        columns: [
          'workspace_id',
          'conversation_id',
          'external_id',
          'sender_id',
          'sender_name',
          'recipient_name',
          'subject',
          'content',
          'sent_at',
          'direction',
          'source_file',
        ],
        conflict: '(workspace_id, external_id)',
        update: null,
      },
      messageRows
    );
    stats.messagesCreated += messageResult.length;
    stats.duplicatesSkipped += messageRows.length - messageResult.length;

    // Conversation rollups
    await sql`
      UPDATE conversations c SET
        message_count   = t.count,
        last_message_at = t.last_at,
        started_at      = COALESCE(c.started_at, t.first_at)
      FROM (
        SELECT conversation_id, count(*)::int AS count, max(sent_at) AS last_at, min(sent_at) AS first_at
        FROM messages WHERE workspace_id = ${workspaceId} GROUP BY conversation_id
      ) t
      WHERE c.id = t.conversation_id AND c.workspace_id = ${workspaceId}
    `;
  }

  // -- Activities ---------------------------------------------------------
  const activityResult = await upsert(
    sql,
    {
      table: 'activities',
      columns: [
        'workspace_id',
        'external_id',
        'person_id',
        'activity_type',
        'content',
        'content_url',
        'created_at',
        'source_file',
      ],
      conflict: '(workspace_id, external_id)',
      update: null,
    },
    dedupe(result.activities, (a) => a.externalId).map((a) => ({
      workspace_id: workspaceId,
      external_id: a.externalId,
      person_id: selfPersonId,
      activity_type: a.activityType,
      content: a.content ?? null,
      content_url: a.contentUrl ?? null,
      created_at: a.createdAt ?? null,
      source_file: a.sourceFile,
    }))
  );
  stats.activitiesCreated += activityResult.length;

  // -- Jobs ---------------------------------------------------------------
  const jobResult = await upsert(
    sql,
    {
      table: 'jobs',
      columns: [
        'workspace_id',
        'external_id',
        'company_id',
        'company_name',
        'title',
        'location',
        'url',
        'applied_at',
        'saved_at',
        'source_file',
      ],
      conflict: '(workspace_id, external_id)',
      update: `
        applied_at = COALESCE(jobs.applied_at, EXCLUDED.applied_at),
        saved_at   = COALESCE(jobs.saved_at, EXCLUDED.saved_at),
        company_id = COALESCE(EXCLUDED.company_id, jobs.company_id)`,
    },
    [...result.jobs.values()].map((j) => {
      const ckey = companyKey(j.companyName);
      return {
        workspace_id: workspaceId,
        external_id: j.externalId,
        company_id: ckey ? (companyIdByKey.get(ckey) ?? null) : null,
        company_name: j.companyName ?? null,
        title: truncate(j.title, 300),
        location: j.location ?? null,
        url: j.url ?? null,
        applied_at: j.appliedAt ?? null,
        saved_at: j.savedAt ?? null,
        source_file: j.sourceFile,
      };
    })
  );
  for (const row of jobResult) if (row.inserted) stats.jobsCreated++;

  // -- Interactions (endorsements, recommendations, invitations) ----------
  // Stored as rows with a deterministic external id, so a repeat import is a
  // no-op rather than double-counting. `people.interaction_count` is derived
  // from these rows plus messages in deriveIntelligence().
  await upsert(
    sql,
    {
      table: 'person_interactions',
      columns: ['workspace_id', 'person_id', 'kind', 'occurred_at', 'external_id'],
      conflict: '(workspace_id, external_id)',
      update: null,
    },
    dedupe(
      result.interactions.filter((i) => personId(i.personKey)),
      (i) => `${personId(i.personKey)}|${i.kind}|${i.at?.toISOString() ?? ''}`
    ).map((i) => ({
      workspace_id: workspaceId,
      person_id: personId(i.personKey)!,
      kind: i.kind,
      occurred_at: i.at ?? null,
      external_id: `${personId(i.personKey)}|${i.kind}|${i.at?.toISOString() ?? 'undated'}`,
    }))
  );

  return stats;
}

/**
 * Map weak (`nc:` / `name:`) keys onto the dedupe key of an existing person
 * with the same name, when exactly one such person exists.
 */
async function resolveWeakIdentitiesAgainstDatabase(
  sql: Sql,
  workspaceId: string,
  people: CanonicalPerson[]
): Promise<Map<string, string>> {
  const weak = people.filter(
    (p) => !p.key.startsWith('url:') && !p.key.startsWith('email:') && p.key !== 'self'
  );
  if (weak.length === 0) return new Map();

  const names = [...new Set(weak.map((p) => p.fullName.toLowerCase()))];
  const rows = (await sql.unsafe(
    `SELECT lower(canonical_name) AS name,
            min(dedupe_key)       AS dedupe_key,
            count(*)::int         AS hits
     FROM people
     WHERE workspace_id = $1
       AND lower(canonical_name) = ANY($2)
       AND (dedupe_key LIKE 'url:%' OR dedupe_key LIKE 'email:%')
     GROUP BY lower(canonical_name)`,
    [workspaceId, names] as never[]
  )) as unknown as { name: string; dedupe_key: string; hits: number }[];

  const unique = new Map(rows.filter((r) => r.hits === 1).map((r) => [r.name, r.dedupe_key] as const));
  const remap = new Map<string, string>();
  for (const p of weak) {
    const target = unique.get(p.fullName.toLowerCase());
    if (target && target !== p.key) remap.set(p.key, target);
  }
  return remap;
}

/** Sum endorsement counts per (person, skill) before writing. */
function aggregateSkills(
  result: NormalizationResult,
  personId: (key: string) => string | undefined,
  workspaceId: string
): Record<string, unknown>[] {
  const byKey = new Map<
    string,
    { workspace_id: string; person_id: string; name: string; endorsement_count: number; source_file: string }
  >();
  for (const s of result.skills) {
    const id = personId(s.personKey);
    if (!id) continue;
    const key = `${id}|${s.name.toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.endorsement_count += s.endorsements;
    } else {
      byKey.set(key, {
        workspace_id: workspaceId,
        person_id: id,
        name: truncate(s.name, 200),
        endorsement_count: s.endorsements,
        source_file: s.sourceFile,
      });
    }
  }
  return [...byKey.values()];
}

/**
 * Link a conversation to the person on the other end.
 * A profile URL is an exact match. A name match is accepted only when it is
 * unambiguous in the workspace — merging two same-named people would be worse
 * than leaving the conversation unlinked.
 */
async function resolveCounterparts(
  sql: Sql,
  workspaceId: string,
  conversations: { externalId: string; counterpartName?: string; counterpartUrl?: string }[],
  personIdByKey: Map<string, string>
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const byName: { externalId: string; name: string }[] = [];

  for (const c of conversations) {
    const slug = profileSlug(c.counterpartUrl);
    const id = slug ? personIdByKey.get(`url:${slug}`) : undefined;
    if (id) {
      out.set(c.externalId, id);
    } else if (c.counterpartName) {
      byName.push({ externalId: c.externalId, name: c.counterpartName });
    }
  }
  if (byName.length === 0) return out;

  const names = [...new Set(byName.map((b) => b.name.toLowerCase()))];
  const matches = (await sql.unsafe(
    `SELECT lower(canonical_name) AS name, min(id::text) AS id, count(*)::int AS hits
     FROM people
     WHERE workspace_id = $1 AND lower(canonical_name) = ANY($2)
     GROUP BY lower(canonical_name)`,
    [workspaceId, names] as never[]
  )) as unknown as { name: string; id: string; hits: number }[];
  const unique = new Map(matches.filter((m) => m.hits === 1).map((m) => [m.name, m.id] as const));
  for (const { externalId, name } of byName) {
    const id = unique.get(name.toLowerCase());
    if (id) out.set(externalId, id);
  }
  return out;
}
