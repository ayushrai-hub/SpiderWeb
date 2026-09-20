# Testing Strategy

## Test Pyramid

```
E2E Tests (few, slow, high confidence)
  ↓
Integration Tests (moderate, test boundaries)
  ↓
Unit Tests (many, fast, test logic)
```

## Test Categories

### Unit Tests

- Entity resolution logic
- Normalization functions
- Analytics calculations
- Tool parameter validation
- Graph query builders

### Integration Tests

- Database operations (testcontainers)
- API endpoint responses
- Import pipeline stages
- BullMQ job processing

### API Tests

- Request/response contracts
- Authentication/authorization
- Error handling
- Pagination

### Database Tests

- Migration correctness
- RLS policies
- Query performance
- Data integrity constraints

### Ingestion Tests

- LinkedIn adapter parsing
- Schema detection
- Tolerance tests (missing files, empty rows, malformed data)
- Normalization accuracy

### Entity Resolution Tests

- Person deduplication
- Company deduplication
- Multi-identifier matching
- Confidence scoring

### Analytics Tests

- Metric computation accuracy
- Time window filtering
- Edge cases (no data, single record)

### Agent Tool Tests

- Tool schema validation
- Parameter validation
- Workspace isolation
- Response format

### Authorization Tests

- Cross-tenant access prevention
- Role-based permissions
- JWT validation

### Security Tests

- SQL injection prevention
- XSS prevention
- CSRF protection
- Rate limiting

### Frontend Tests

- Component rendering
- User interactions
- Route navigation
- Form validation

### E2E Tests (Playwright)

- Full import flow
- Dashboard display
- AI chat interaction
- People/company search

## Synthetic Fixtures

LinkedIn importer needs:

- Complete export (all 52 files)
- Partial export (missing optional files)
- Empty files (headers only)
- Duplicate filenames
- Malformed rows
- Missing required columns
- Unknown columns
- Future schema variants

All synthetic. No real user data.
