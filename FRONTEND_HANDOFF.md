# Frontend handoff

All list endpoints return JSON and all errors use `{ "error": string, "issues"?: [{ "path": (string|number)[], "message": string }] }`.

## Routes

- `GET /api/dashboard/overview` — totals, top-five `rankings.byReach`, top-five `rankings.byEngagement`, account summaries.
- `GET /api/posts` — `{ items, pagination }`; each item has account, ordered assets, and `metrics[0]` as latest snapshot.
- `POST /api/posts` — create a post; returns `{ item }`, HTTP 201.
- `GET /api/posts/:id` — full post, ordered assets, chronological metric history, calendar entry, experiments.
- `PATCH /api/posts/:id` — partial post update; metrics are not accepted here.
- `GET /api/posts/:id/metrics` — immutable snapshots oldest-first.
- `POST /api/posts/:id/metrics` — append one snapshot; duplicate `(postId,capturedAt)` returns 409.
- `GET /api/compare?ids=id1,id2` — requires 2–5 unique UUIDs; preserves requested order and returns history plus `latestMetric`, `engagement`, and `engagementRate`.
- `GET /api/health` — liveness only, no database check.

## Shared filters

`accountId`, `dateFrom`, `dateTo`, `topic`, `pillar`, `style`, `type`, `status`; posts also accept `page` (default 1) and `pageSize` (default 20, max 100). Dates are UTC `YYYY-MM-DD`; dashboard/post date filters target `publishedAt`.

Enums are generated in `src/generated/prisma/enums.ts`. Dummy content exists only in `prisma/seed.ts`. Recharts is installed but unused. Replace `src/app/page.tsx`; do not embed seed data in React.
