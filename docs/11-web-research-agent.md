# Web Research Agent

**Post-MVP. Documented here for architecture completeness.**

## Purpose

Enrich private user data with permitted public-web information. Separate subsystem from core platform.

## Data Separation

System must distinguish and label:
- **PRIVATE_DATA** — from user's imports
- **PUBLIC_WEB_DATA** — from permitted web sources
- **INFERRED_DATA** — model-derived
- **AI_GENERATED_ANALYSIS** — LLM synthesis

Never silently replace user data with web data. Store both.

## Research Workflow

```
PERSON (identity resolution)
  ↓
PERMITTED PUBLIC-SOURCE SEARCH
  ↓
SOURCE EXTRACTION
  ↓
EVIDENCE EXTRACTION
  ↓
FACT NORMALIZATION
  ↓
CONFIDENCE SCORING
  ↓
TIMESTAMP
  ↓
STORE OBSERVATION
```

## Observation Record

```json
{
  "person_id": "person_123",
  "fact": "Works at Company X",
  "value": "Company X",
  "source_type": "public_web",
  "source_url": "https://...",
  "observed_at": "2024-01-15T00:00:00Z",
  "confidence": 0.94,
  "evidence": "LinkedIn public profile snippet"
}
```

## Constraints

- Respect website terms of service
- Respect robots/access restrictions
- Respect privacy law
- Do not design around unauthorized scraping or access controls
- Only permitted public sources
- User must opt-in to web research per entity
