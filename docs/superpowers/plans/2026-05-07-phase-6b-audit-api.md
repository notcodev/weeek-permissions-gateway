# Phase 6b — Audit Reader API + Retention Cron

**Goal:** tRPC `audit.search` + `audit.stats` over the rows phase 6a is writing, plus a protected cron endpoint that prunes rows older than `AUDIT_RETENTION_DAYS`.

## Env additions

```env
AUDIT_RETENTION_DAYS=90
CRON_SECRET=replace-with-32-bytes-base64
```

`AUDIT_RETENTION_DAYS` defaults to 90 when unset/invalid. `CRON_SECRET` is a 32-byte base64 token (`pnpm genkey`) — required for the retention endpoint to do anything.

## tRPC `audit` router

`src/server/trpc/routers/audit.ts`. Two procedures, both `protectedProcedure` with the same workspace-ownership gate as the rest of the surface.

### `search({workspaceId, from?, to?, subKeyId?, statusMin?, statusMax?, denyReason?, pathContains?, cursor?, limit?})`

- Period defaults to last 7 days when both `from` and `to` are absent.
- Cursor is `{ createdAt: ISO, id: string }`. Order by `(created_at desc, id desc)` so ties between rows in the same millisecond stay deterministic.
- Limit default 50, max 200.
- `pathContains` uses `ILIKE %term%`.
- Return shape: `{ items: AuditPublic[], nextCursor: { createdAt, id } | null }`. `AuditPublic` strips the `ipHash` bytes; consumer gets `hasIpHash: boolean` instead.

### `stats({workspaceId, from?, to?})`

- Total count
- Status buckets: `2xx`/`3xx`/`4xx`/`5xx` via Postgres `count(*) filter (where ...)` aggregates in one round-trip
- `denyBreakdown: Record<string, number>` grouped by non-null `deny_reason`
- Latency p50 + p95 via `percentile_cont(... within group ...)`. Null on empty set.

Registered in `src/server/trpc/routers/index.ts`.

## Retention cron

`src/server/proxy/auditRetention.ts`:
- `getRetentionDays()` reads `AUDIT_RETENTION_DAYS`, falls back to 90.
- `purgeAuditOlderThan(days)` deletes rows with `created_at < now - days` and returns `{ retentionDays, cutoff, deleted }`. Idempotent.

`src/app/api/cron/audit-retention/route.ts`:
- GET + POST, `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
- Constant-time bearer compare against `CRON_SECRET`. 401 on miss.
- Calls `purgeAuditWithEnvDefault()` and returns `{ ok, retentionDays, cutoff, deleted }`.
- Errors swallowed at handler level → 500 with generic envelope; details only in pino logs.

External scheduler responsibility (Vercel Cron / GitHub Actions / `cron` on a host) — daily at any time is fine. Not invoked automatically by the Next runtime.

## Tests

- `tests/integration/audit-router.test.ts` — 11 tests covering ownership, filter combos (denyReason, status range, pathContains, from/to), cursor pagination invariant, public shape, and stats over a fixture.
- `tests/integration/audit-retention.test.ts` — 5 tests: pure helper + cron endpoint (401/bearer/200).

Total suite: 190 → 206 (+16). Lint and typecheck clean.

## What's deferred to 6c

- UI viewer page (filter sidebar + paginated table + URL state sync per spec §11)
- CSV export — spec marked stretch goal; will not ship in 6c either unless re-prioritised

## Commits

1. `phase-6b task 0: env vars (AUDIT_RETENTION_DAYS, CRON_SECRET) in .env.example`
2. `phase-6b task 1+2: audit.search + audit.stats tRPC + tests`
3. `phase-6b task 3: audit-retention cron route + purge helper + tests`
4. `docs: phase 6b plan`
