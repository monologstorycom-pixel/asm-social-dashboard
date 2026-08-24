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

## Content Plan API

The additive `content_plan_items` migration stores imported Staff CSV briefs without replacing existing `Content_ID` rows. Preview/import accepts either JSON `{ "csv": "..." }` or multipart form-data with a `file` field; CSV content is limited to 1 MiB and must use the exact 31-column header documented in `FRONTEND_HANDOFF.md`.

Routes: `GET /api/content-plan`, `GET /api/content-plan/today`, `GET /api/content-plan/:contentId`, `PATCH /api/content-plan/:contentId/status`, `POST /api/content-plan/import/preview`, and `POST /api/content-plan/import`. The API does not publish, schedule jobs, mutate Meta/Instagram, or generate plans.
