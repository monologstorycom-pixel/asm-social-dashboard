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
