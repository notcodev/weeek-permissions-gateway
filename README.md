# Weeek Permissions Gateway

A multi-tenant gateway that issues scoped Weeek API keys with explicit
permissions and audit. See `docs/superpowers/specs/2026-05-06-weeek-permissions-gateway-design.md`
for the full design.

## Phase 1 status

- Email + password auth (Better Auth)
- Postgres + Drizzle migrations
- tRPC bootstrap (`me.whoami`)
- Liveness/readiness endpoints
- Integration tests against a real Postgres via testcontainers

## Local dev

```bash
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))" \
  # paste into BETTER_AUTH_SECRET in .env

docker compose -f docker-compose.dev.yml up -d
pnpm install
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000.

## Scripts

| Command            | Purpose                                |
| ------------------ | -------------------------------------- |
| `pnpm dev`         | Run Next.js in dev                     |
| `pnpm build`       | Production build                       |
| `pnpm test`        | Run integration tests (testcontainers) |
| `pnpm typecheck`   | TypeScript --noEmit                    |
| `pnpm lint`        | ESLint                                 |
| `pnpm format`      | Prettier check                         |
| `pnpm db:generate` | Generate drizzle migrations            |
| `pnpm db:migrate`  | Apply migrations to `$DATABASE_URL`    |
