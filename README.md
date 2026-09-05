# ASM Social Media Command Center V1

Next.js App Router backend with Prisma/MariaDB. Copy `.env.example` to a local `.env` and replace placeholders before database commands; no real `.env` is committed.

```sh
pnpm install
pnpm prisma:generate
pnpm prisma:migrate:dev
pnpm seed
pnpm dev
```

Dashboard access requires `DASHBOARD_USERNAME`, `DASHBOARD_PASSWORD`, and a random `SESSION_SECRET` in the runtime environment. Generate the secret with `openssl rand -base64 32`; never commit credential values.

Quality gates: `pnpm prisma:format && pnpm prisma:validate && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

The production image runs `prisma migrate deploy` before `server.js`. Migration execution requires a reachable MariaDB and a deployment identity authorized for schema changes.

## Content operations

The database is the operational source of truth. `Content_ID` links the imported plan, final artifact/QA evidence, approval attempt, publisher result, live post, and immutable metric snapshots. General status updates cannot enter `approved`, skip lifecycle stages, or bypass evidence invariants.

Pilot publication requires the byte-exact command `APPROVE & PUBLISH`. Internal routes fail closed unless `Authorization: Bearer $INTERNAL_API_TOKEN` is valid. `POST /api/internal/publisher/due` publishes one due item only when `META_PUBLISH_ENV=staging` and its exact Instagram account matches `META_STAGING_IG_USER_ID`; the default `disabled` value fails closed. Meta metric sync stores due H+1/H+6/H+24/H+72/D+7 snapshots; duplicates are skipped by `(post, source, window)`.

Operational routes:

- `GET|POST /api/internal/agent/due` — list and atomically claim creation work.
- `POST /api/internal/content-plan/:contentId/artifacts` — upsert canonical artifacts, caption, brief, and QA.
- `POST /api/internal/content-plan/:contentId/approve` — record exact approval and a unique attempt.
- `POST /api/internal/content-plan/:contentId/schedule` — enforce the controlled publish window.
- `GET /api/internal/publisher/due` — list due jobs.
- `POST /api/internal/publisher/due` with `{ "Content_ID": "..." }` — publish exactly one due job to the configured staging account.

### Staging-safe Instagram publish test

1. Use a dedicated Instagram Professional test account linked to the Meta app. Never reuse the production Instagram user ID or token.
2. Set `META_PUBLISH_ENV=staging`, `META_STAGING_IG_USER_ID` to that test account's numeric ID, and `META_ACCESS_TOKEN` to a token authorized for that account. Leave production with `META_PUBLISH_ENV=disabled`.
3. Prepare one approved, scheduled, due content-plan item whose linked `SocialAccount.platformAccountId` exactly equals `META_STAGING_IG_USER_ID`; every final asset must have a publicly reachable HTTPS URL.
4. Preview the selected item with `GET /api/internal/publisher/due`, then invoke `POST /api/internal/publisher/due` once using the internal bearer token and the selected `Content_ID`.
5. Verify the returned media ID/permalink belongs to the test account and the content plan/post changed to `published`. If the account ID differs, the endpoint returns `403` before contacting Meta.

A real staging publish is impossible until the test Professional account, linked Meta app permissions/token, numeric account ID, public HTTPS media, and a due database record are supplied. Unit tests use a fake Graph endpoint and never contact Meta.
- `POST /api/internal/content-plan/:contentId/publish-result` — idempotent success/failure callback tied to the approved attempt.
- `POST /api/internal/meta/sync-due` and `POST /api/internal/content-plan/:contentId/meta-sync` — read-only Meta metric sync using server time only; missed windows are never backfilled with current metrics.
- `GET /api/internal/reconciliation` — read-only drift report. The bounded repair helper is not exposed or auto-run.
- `GET /api/content-plan/:contentId/publishing-intelligence` — controlled fallback or account-evidence recommendation.

Analytics endpoints accept `dataMode=auto|demo|live|all` and return explicit `dataMode` and `source`. `auto` selects live only after the selected account/post set has a Meta snapshot; demo and live metrics never mix unless `all` is explicit.

The additive migration is `20260824180000_add_content_operations`. Prior migration SHA-256 values used for integrity review:

- `20260824000000_init`: `33288fe244a67fb471a5a5ba63b73d33e52dc30562613bc21a235c51c105fbc2`
- `20260824120000_add_content_plans`: `8e62ddcbe9a273f5ee4b47892e29ee19e70c7c6eebb8e95f43cd978d35085d70`

CSV preview/import remains bounded to 1 MiB and the exact 31-column contract in `FRONTEND_HANDOFF.md`. No real secret belongs in `.env.example`, source, logs, or commits.
