# Future Integrations

## Priority 1: Gmail / Outlook

### Gmail
- OAuth2 flow
- Email parsing (sender, recipient, subject, body, date)
- Contact extraction
- Communication pattern analysis
- Calendar events

### Outlook
- Microsoft Graph API
- Same capabilities as Gmail
- Enterprise SSO support

## Priority 2: Calendar

### Google Calendar
- Event extraction
- Attendee list
- Meeting frequency analysis

### Outlook Calendar
- Same via Microsoft Graph

## Priority 3: CRM Integration

### Salesforce
- Contact sync
- Opportunity tracking
- Activity history

### HubSpot
- Contact sync
- Deal pipeline
- Email tracking

## Priority 4: Social Platforms

### Twitter/X
- Follower/following analysis
- Engagement metrics
- Content analysis

### GitHub
- Contribution activity
- Repository relationships
- Collaboration patterns

## Priority 5: Document Intelligence

### Resume/CV
- PDF parsing
- Skill extraction
- Career timeline

### Notes/Docs
- Free-form text analysis
- Topic extraction
- Entity linking

## Integration Architecture

Each integration follows same pattern:

```
Source Adapter → Schema Detection → Parser → Normalization → Canonical Model
```

New adapter implements:
1. `SourceAdapter` interface
2. File recognition logic
3. Schema mapping to canonical model
4. Entity resolution rules
5. Tests with synthetic fixtures

No changes to core system needed per integration.
