# Knowledge Graph

## Graph Abstraction

PostgreSQL-backed graph. No separate graph database for MVP. Graph queries via SQL joins and recursive CTEs.

## Core Node Types

- **Person** — central node. Internal user, connection, message participant, etc.
- **Company** — first-class entity. Multiple observations over time.
- **Job** — posting, application, saved.
- **Message** — within conversation context.
- **Activity** — post, comment, reaction, share.
- **Skill** — professional competency.
- **Education** — academic background.

## Core Edge Types

### User-centric

| Edge         | From | To            | Properties                |
| ------------ | ---- | ------------- | ------------------------- |
| CONNECTED_TO | User | Person        | connected_at, source      |
| MESSAGED     | User | Person        | message_count, last_at    |
| INVITED      | User | Person        | invited_at, status        |
| COMMENTED_ON | User | Activity      | comment_at                |
| REACTED_TO   | User | Activity      | reaction_type, reacted_at |
| SHARED       | User | Activity      | shared_at                 |
| SAVED        | User | Job/SavedItem | saved_at                  |
| APPLIED_TO   | User | Job           | applied_at, status        |
| FOLLOWS      | User | Company       | followed_at               |

### Person-centric

| Edge                 | From   | To            | Properties                              |
| -------------------- | ------ | ------------- | --------------------------------------- |
| WORKS_AT             | Person | Company       | title, start_date, end_date, is_current |
| PREVIOUSLY_WORKED_AT | Person | Company       | title, start_date, end_date             |
| HAS_SKILL            | Person | Skill         | endorsement_count                       |
| ATTENDED             | Person | Education     | degree, field, dates                    |
| HAS_CERTIFICATION    | Person | Certification | date                                    |
| HAS_PROJECT          | Person | Project       | description, dates                      |

### Company-centric

| Edge         | From    | To       | Properties           |
| ------------ | ------- | -------- | -------------------- |
| HAS_JOB      | Company | Job      | posted_at            |
| HAS_EMPLOYEE | Company | Person   | employment_record_id |
| OPERATES_IN  | Company | Location | source               |
| HAS_INDUSTRY | Company | Industry | source               |

### Communication

| Edge                 | From    | To           | Properties |
| -------------------- | ------- | ------------ | ---------- |
| PART_OF_CONVERSATION | Message | Conversation | position   |
| SENT_BY              | Message | Person       | direction  |
| SENT_TO              | Message | Person       | direction  |

## Edge Properties (All Edges)

- **source** — data source that created this edge
- **confidence** — 0.0 to 1.0
- **created_at** — when edge was created in system
- **observed_at** — when edge was observed in source data
- **valid_from** — temporal start
- **valid_until** — temporal end (null = current)
- **evidence** — reference to source record

## Graph Queries (Examples)

### "Who in my network works at Company X?"

```sql
SELECT p.* FROM people p
JOIN person_employment pe ON pe.person_id = p.id
WHERE pe.company_name = 'Company X' AND pe.is_current = true
AND p.workspace_id = :workspace_id;
```

### "Which people could introduce me to Person Y?"

```sql
-- 2nd-degree connections through shared companies/conversations
SELECT DISTINCT p2.* FROM connections c1
JOIN conversations conv ON conv.workspace_id = :workspace_id
JOIN conversation_participants cp1 ON cp1.conversation_id = conv.id AND cp1.person_id = c1.person_id
JOIN conversation_participants cp2 ON cp2.conversation_id = conv.id AND cp2.person_id != :user_person_id
JOIN people p2 ON p2.id = cp2.person_id
WHERE c1.person_id = :target_person_id;
```

### "What's the relationship strength between two people?"

Based on: message count, recency, shared conversations, mutual connections.
