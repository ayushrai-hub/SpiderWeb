# AI Agent Architecture

## Overview

AI assistant that understands user's entire workspace. Answers questions using private data, graph relationships, semantic search, and optionally public web information.

## Architecture

```
USER QUESTION
  ↓
INTENT CLASSIFICATION (what does user want?)
  ↓
TOOL SELECTION (which tools answer this?)
  ↓
DATA RETRIEVAL (SQL queries via tools)
  ↓
GRAPH RETRIEVAL (relationship traversal)
  ↓
VECTOR RETRIEVAL (semantic search)
  ↓
OPTIONAL WEB RESEARCH (public info enrichment)
  ↓
EVIDENCE SYNTHESIS (combine sources)
  ↓
RESPONSE (answer + evidence + provenance)
```

## Available Tools

| Tool                 | Purpose                            | Data Source        |
| -------------------- | ---------------------------------- | ------------------ |
| search_people        | Find people by criteria            | SQL                |
| search_companies     | Find companies by criteria         | SQL                |
| search_messages      | Search message content             | Full-text + vector |
| search_conversations | Find conversations                 | SQL                |
| search_jobs          | Find jobs by criteria              | SQL                |
| search_connections   | Find connections                   | SQL                |
| search_activities    | Find activities                    | SQL                |
| query_analytics      | Get computed metrics               | Analytics cache    |
| query_graph          | Traverse relationships             | Graph queries      |
| semantic_search      | Find by meaning                    | pgvector           |
| get_person           | Get person details                 | SQL                |
| get_company          | Get company details                | SQL                |
| get_conversation     | Get conversation + messages        | SQL                |
| get_insights         | Get generated insights             | SQL                |
| run_web_research     | Research person/company (post-MVP) | External APIs      |

## Tool Design Principles

1. **Controlled access.** LLM never executes raw SQL. Tools validate parameters.
2. **Workspace-scoped.** Every query filtered by workspace_id from JWT.
3. **Audited.** Every tool call logged with input, output, duration.
4. **Timeout-bounded.** Max 30s per tool call.
5. **Rate-limited.** Max 20 tool calls per conversation turn.

## Security

- JWT validates workspace access
- Tool schemas enforce parameter types
- Query builder prevents injection
- No sensitive data in prompts unless tool-retrieved
- External content sanitized before LLM processing
- Prompt injection detection on user input

## Response Format

```json
{
  "answer": "Natural language response",
  "evidence": [
    {
      "type": "person",
      "id": "...",
      "data": {...},
      "source": "linkedin_import",
      "confidence": 0.95
    }
  ],
  "tools_used": ["search_people", "query_graph"],
  "confidence": 0.87
}
```
