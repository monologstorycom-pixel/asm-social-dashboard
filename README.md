# ASM Social Media Command Center V1

Next.js App Router backend with Prisma/MariaDB. Copy `.env.example` to a local `.env` and replace placeholders before database commands; no real `.env` is committed.

```sh
pnpm install
pnpm prisma:generate
pnpm prisma:migrate:dev
pnpm seed
pnpm dev
```

Quality gates: `pnpm prisma:format && pnpm prisma:validate && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

The production image runs `prisma migrate deploy` before `server.js`. Migration execution requires a reachable MariaDB and a deployment identity authorized for schema changes.

## Content operations

The database is the operational source of truth. `Content_ID` links the imported plan, final artifact/QA evidence, approval attempt, publisher result, live post, and immutable metric snapshots. General status updates cannot enter `approved`, skip lifecycle stages, or bypass evidence invariants.

Pilot publication requires the byte-exact command `APPROVE & PUBLISH`. Internal routes fail closed unless `Authorization: Bearer $INTERNAL_API_TOKEN` is valid. The backend never publishes to Meta: the existing publisher claims due work and reports its result. Meta integration is read-only and stores due H+1/H+6/H+24/H+72/D+7 snapshots; duplicates are skipped by `(post, source, window)`.

Operational routes:

- `GET|POST /api/internal/agent/due` — list and atomically claim creation work.
- `POST /api/internal/content-plan/:contentId/artifacts` — upsert canonical artifacts, caption, brief, and QA.
- `POST /api/internal/content-plan/:contentId/approve` — record exact approval and a unique attempt.
- `POST /api/internal/content-plan/:contentId/schedule` — enforce the controlled publish window.
- `GET /api/internal/publisher/due` — due jobs for the existing publisher.
- `POST /api/internal/content-plan/:contentId/publish-result` — idempotent success/failure callback tied to the approved attempt.
- `POST /api/internal/meta/sync-due` and `POST /api/internal/content-plan/:contentId/meta-sync` — read-only Meta metric sync.
- `GET /api/internal/reconciliation` — read-only drift report. The bounded repair helper is not exposed or auto-run.
- `GET /api/content-plan/:contentId/publishing-intelligence` — controlled fallback or account-evidence recommendation.

Analytics endpoints accept `dataMode=auto|demo|live|all` and return explicit `dataMode` and `source`. `auto` selects live only after the selected account/post set has a Meta snapshot; demo and live metrics never mix unless `all` is explicit.

The additive migration is `20260824180000_add_content_operations`. Prior migration SHA-256 values used for integrity review:

- `20260824000000_init`: `33288fe244a67fb471a5a5ba63b73d33e52dc30562613bc21a235c51c105fbc2`
- `20260824120000_add_content_plans`: `8e62ddcbe9a273f5ee4b47892e29ee19e70c7c6eebb8e95f43cd978d35085d70`

CSV preview/import remains bounded to 1 MiB and the exact 31-column contract in `FRONTEND_HANDOFF.md`. No real secret belongs in `.env.example`, source, logs, or commits.
