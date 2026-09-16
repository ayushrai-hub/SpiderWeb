# Frontend Architecture

## Framework

Next.js 14+ (App Router). TypeScript. Tailwind CSS.

## Component Architecture

```
app/
├── (auth)/
│   ├── login/
│   ├── signup/
│   ├── verify/
│   └── reset/
├── (dashboard)/
│   ├── layout.tsx          — Sidebar + top nav
│   ├── page.tsx            — Dashboard home
│   ├── network/page.tsx
│   ├── people/
│   │   ├── page.tsx        — People list
│   │   └── [id]/page.tsx   — Person profile
│   ├── companies/
│   │   ├── page.tsx        — Company list
│   │   └── [id]/page.tsx   — Company profile
│   ├── messages/page.tsx
│   ├── outreach/page.tsx
│   ├── jobs/page.tsx
│   ├── activities/page.tsx
│   ├── insights/page.tsx
│   ├── assistant/page.tsx  — AI chat
│   ├── research/page.tsx
│   ├── imports/
│   │   ├── page.tsx        — Import list
│   │   └── new/page.tsx    — Upload new
│   └── settings/page.tsx
```

## Navigation

| Route | Label | Icon |
|-------|-------|------|
| / | Dashboard | Home |
| /network | Network | Graph |
| /people | People | Users |
| /companies | Companies | Building |
| /messages | Messages | Mail |
| /outreach | Outreach | Send |
| /jobs | Jobs | Briefcase |
| /activities | Activities | Activity |
| /insights | Insights | Lightbulb |
| /assistant | AI Assistant | Bot |
| /research | Research | Search |
| /imports | Imports | Upload |
| /settings | Settings | Settings |

## State Management

- **Server state:** TanStack Query (fetching, caching, invalidation)
- **URL state:** search params for filters, pagination
- **Form state:** React Hook Form + Zod validation
- **No global client state** — avoid Redux/Zustand for MVP

## Key Components

### Data Tables
- TanStack Table for sortable, filterable lists
- Server-side pagination for large datasets
- Column-level search and filter

### Charts
- Recharts for network, communication, career metrics
- Responsive containers
- Tooltip with details

### AI Chat
- ChatGPT-like interface
- Message list with user/assistant/tool messages
- Evidence cards inline
- Loading states for tool execution

### Import Flow
- Multi-step wizard
- Drag-and-drop upload
- Real-time processing progress (polling)
- Step-by-step status display

## Loading/Error/Empty States

Every page must handle:
- **Loading:** Skeleton screens, not spinners
- **Error:** Retry button, error message, contact support link
- **Empty:** Illustration, explanation, CTA to upload data
