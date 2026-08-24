# Frontend handoff

All list endpoints return JSON and all errors use `{ "error": string, "issues"?: [{ "path": (string|number)[], "message": string }] }`.

## Routes

- `GET /api/dashboard/overview` — totals, performance timeline, top posts/topics/styles, accounts, and filter options.
- `GET /api/posts` — `{ dataMode, source, items, pagination, sort }`; each item has account, ordered assets, and `latestMetric`.
- `POST /api/posts` — create a post; returns `{ item }`, HTTP 201.
- `GET /api/posts/:id` — full post, ordered assets, chronological metric history, calendar entry, experiments.
- `PATCH /api/posts/:id` — partial post update; metrics are not accepted here.
- `GET /api/posts/:id/metrics` — immutable snapshots oldest-first.
- `POST /api/posts/:id/metrics` — append one snapshot; duplicate `(postId,capturedAt)` returns 409.
- `GET /api/compare?ids=id1,id2` — requires 2–5 unique UUIDs; preserves requested order and returns metric history plus `latestMetric`.
- `GET /api/health` — liveness only, no database check.

## Content Plan API

Every returned plan item uses this complete shape (optional CSV cells remain empty strings):

```json
{
  "id": "internal UUID",
  "Content_ID": "ASM-PILOT-20260825-01",
  "date": "2026-08-25",
  "hari": "Selasa",
  "test_publish_window": "19:00 WIB",
  "pillar": "...",
  "goal": "...",
  "format": "...",
  "creative_style": "...",
  "audience": "...",
  "topic": "...",
  "working_title": "...",
  "hook": "...",
  "core_angle": "...",
  "slide_1": "...",
  "slide_2": "...",
  "slide_3": "...",
  "slide_4_5": "...",
  "visual_direction": "...",
  "cta": "...",
  "caption_brief": "...",
  "primary_metric": "...",
  "secondary_metric": "...",
  "engagement_mechanic": "...",
  "story_companion": "...",
  "experiment_tag": "...",
  "product_focus": "...",
  "claim_guardrail": "...",
  "assets_needed": "...",
  "status": "planned",
  "approval_status": "pending",
  "publish_status": "off",
  "publishing_mode": "off",
  "created_at": "2026-08-24T12:00:00.000Z",
  "updated_at": "2026-08-24T12:00:00.000Z"
}
```

### Read routes

- `GET /api/content-plan?search=&status=&dateFrom=&dateTo=&pillar=&topic=&page=1&pageSize=25&sort=asc`
  - `status`: workflow enum below; dates are inclusive UTC `YYYY-MM-DD`; `sort` is date `asc|desc`; page size max 100.
  - `search` matches Content ID, title, hook, core angle, and topic.
  - Returns `{ "items": [...], "pagination": { "page": 1, "pageSize": 25, "total": 7, "totalPages": 1 }, "sort": { "field": "date", "order": "asc" } }`.
- `GET /api/content-plan/today?date=2026-08-25`
  - `date` is optional and is provided for deterministic UI/testing. Without it, “today” is the current calendar date in WIB (`Asia/Jakarta`), not UTC.
  - Returns `{ "date": "2026-08-25", "timezone": "Asia/Jakarta", "items": [...] }`; each item contains the full brief, status, approval status, and publishing mode.
- `GET /api/content-plan/:contentId` returns `{ "item": { ...full item... } }`; unknown IDs return 404.

### Workflow status

`PATCH /api/content-plan/:contentId/status` with JSON `{ "status": "approved_for_creation" }` returns `{ "item": { ...full item... } }`. Only the same status (idempotent) or one adjacent forward transition is accepted; skips, backward moves, and concurrent stale updates return 409.

`planned → approved_for_creation → creating → ready_for_review → approved → scheduled → published → measuring`

This route only updates workflow state. It does not publish, schedule a worker, call Meta/Instagram, or generate content.

### CSV preview and import

Both POST routes accept `Content-Type: application/json` with `{ "csv": "<CSV text>" }`, or `multipart/form-data` with a file in field `file`. CSV content must be at most 1 MiB. The header must match exactly:

```text
Content_ID,Date,Hari,Test_Publish_Window,Pillar,Goal,Format,Creative_Style,Audience,Topic_Tag,Working_Title,Hook,Core_Angle,Slide_1,Slide_2,Slide_3,Slide_4_5,Visual_Direction,CTA,Caption_Brief,Primary_Metric,Secondary_Metric,Engagement_Mechanic,Story_Companion,Experiment_Tag,Product_Focus,Claim_Guardrail,Assets_Needed,Agent_Status,Approval_Status,Publish_Status
```

- `POST /api/content-plan/import/preview` never writes. It returns:
  ```json
  {
    "summary": { "total": 7, "valid": 7, "invalid": 0, "duplicates": 0, "insertable": 7 },
    "rows": [{ "row": 2, "contentId": "ASM-PILOT-20260825-01", "valid": true, "errors": [], "duplicateReason": null }],
    "errors": []
  }
  ```
  `duplicateReason` is `within_file`, `existing_database`, or `null`.
- `POST /api/content-plan/import` transactionally inserts only valid, nonduplicate rows and never overwrites an existing `Content_ID`. It returns HTTP 201:
  ```json
  { "inserted": 7, "skipped": 0, "errors": [], "count": { "total": 7, "inserted": 7, "skipped": 0, "invalid": 0 } }
  ```
  Re-importing the same seven rows returns `inserted: 0`, `skipped: 7`. Invalid data rows are reported and skipped; malformed/missing required headers reject the whole upload with HTTP 400 and no writes.

## Shared filters

`account`, `dataMode`, `dateFrom`, `dateTo`, `topic`, `pillar`, `style`, `type`, `status`; posts also accept `search`, `sort`, `order`, `page` (default 1), and `pageSize` (default 20, max 100). Dates are UTC `YYYY-MM-DD`; dashboard/post date filters target `publishedAt`.

Enums are generated in `src/generated/prisma/enums.ts`. Dummy content exists only in `prisma/seed.ts`. Recharts is installed but unused. Replace `src/app/page.tsx`; do not embed seed data in React.

## Operational and analytics contract

All dashboard/post read endpoints accept `dataMode=auto|demo|live|all` and return top-level `dataMode` plus `source` (`demo`, `meta`, or `mixed`). Never combine demo and Meta series in one chart unless the operator explicitly selected `all`. `auto` stays visibly demo-labelled until the selected account/post set has at least one Meta snapshot, then selects live.

- `GET /api/content-plan/:contentId/publishing-intelligence` returns `{ Content_ID, recommendation }`. Recommendation fields are `recommendedWindow`, `basis`, `confidence`, `sampleCount`, `evidence`, and `caveat`. `basis=controlled_test_window` is not an “optimal time”; `basis=account_performance` requires at least 10 comparable same-account LIVE Meta samples.
- Plan detail responses may also include `content_post_id`, final caption/brief, QA fields, approval evidence, schedule/publication timestamps, publisher state/error, ordered assets, and linked post.
- General `PATCH .../status` cannot enter `approved`; approval is internal and requires the exact fresh literal `APPROVE & PUBLISH`.

Internal routes require a bearer token and are for Staff/publisher jobs, not browser UI:

- `GET|POST /api/internal/agent/due`
- `POST /api/internal/content-plan/:contentId/artifacts`
- `POST /api/internal/content-plan/:contentId/approve`
- `POST /api/internal/content-plan/:contentId/schedule`
- `GET /api/internal/publisher/due`
- `POST /api/internal/content-plan/:contentId/publish-result`
- `POST /api/internal/meta/sync-due`
- `POST /api/internal/content-plan/:contentId/meta-sync`
- `GET /api/internal/reconciliation` (read-only)

Internal authentication is fail-closed: an unset server `INTERNAL_API_TOKEN` returns 503, and invalid/missing `Authorization: Bearer …` returns 401 using constant-time comparison. Responses never expose Meta or internal tokens.

Publisher callbacks are tied to `approvalAttemptId`. A success must contain `instagramMediaId`, `publishedAt`, and either `permalink` or `publicUrl`. Meta sync is read-only; it never publishes or mutates Instagram content. It appends (never overwrites) one `source=meta` snapshot per H+1, H+6, H+24, H+72, and D+7 window, deduped by `(post, source, snapshotWindow)`; the first stored snapshot transactionally advances `published → measuring` and records early engagement velocity.
