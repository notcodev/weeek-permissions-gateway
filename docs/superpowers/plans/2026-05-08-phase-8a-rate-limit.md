# Phase 8a — Coarse Rate Limiting (Spec §12)

**Goal:** Wire the spec §12 DoS protection — 60 req/min per client IP and 600 req/min per sub-key, both 429 with `Retry-After`. Closes the `rate_limited` enum value that has been declared in `ProxyErrorCode` since phase 4 but unused.

## Schema

`src/server/db/schema/rateLimit.ts`:

```
rate_limit_bucket {
  bucket_key  text PK
  window_start timestamptz NOT NULL
  count        int NOT NULL DEFAULT 0
}
```

One row per bucket key. Reused across windows — no append-only growth. Stale rows for never-returning IPs are bounded by IP space and harmless; reaping can be folded into the audit-retention cron later if needed.

Migration: `0005_breezy_vengeance.sql`.

## Helper

`src/server/proxy/rateLimit.ts`:
- `RATE_LIMITS` constants: `perIpPerMinute = 60`, `perSubKeyPerMinute = 600`.
- `checkAndIncrement(bucketKey, limit)` — single round-trip raw SQL `INSERT … ON CONFLICT DO UPDATE` with a `CASE` that increments-or-resets based on whether `window_start >= now() - interval '60 seconds'`. Returns `{ allowed, count, remaining, retryAfterSec }`.
- `ipBucketKey(hashedIpHex)` / `subKeyBucketKey(subKeyId)` — prefix helpers.
- `_resetRateLimitsForTests()` — wipes the table.

Drizzle's `onConflictDoUpdate` had quirks with self-referencing CASE in the SET; raw SQL via `db.execute(sql\`…\`)` is unambiguous and still single round-trip.

## Handler integration

`src/server/proxy/handler.ts`:
- New step **0** before auth: hash `x-forwarded-for` first hop with `hashClientIp` (already used for audit), bucket as `ip:<hex>`, check against 60/min cap. Skip when no header (typically only in tests; production is behind Caddy which always sets the header).
- New step **1b** after auth: bucket by `subkey:<subKeyId>`, check against 600/min cap. Records an audit row with `denyReason = "rate_limited"` so the dashboard can surface throttled traffic.
- Both 429 responses include `retry-after` header (seconds until the current window expires).

## Error envelope

`errorResponse` in `src/server/proxy/errors.ts` gains an optional `retryAfterSec` field; when set, emits `retry-after: <seconds>` header alongside the JSON body.

## Tests

- `tests/integration/rate-limit.test.ts` — 6 unit-style tests on `checkAndIncrement` (first request, increment under limit, blocks when exceeded, isolates across keys, rolls window forward after staleness, key prefix helpers).
- `tests/integration/proxy-rate-limit.test.ts` — 4 E2E tests through the handler (IP cap → 429 + Retry-After, sub-key cap → 429 + audit denyReason, normal traffic not throttled, audit row records `rate_limited`). Pre-fills the bucket via `checkAndIncrement` directly to avoid making 60/600 actual proxy calls — same code path, faster wall clock.

Total suite: 219 → 229 (+10). Lint and typecheck clean.

## Notes

- MSW `onUnhandledRequest: "warn"` instead of `"error"` in this file because cross-file MSW state can race in vitest's parallel pool. Other test files keep `"error"` strictness; this file just needs a less strict default for its specific shape.
- 429 audit only fires for the sub-key bucket (post-auth). IP-bucket 429 has no workspace context yet, so it lives only in pino logs — same pattern as pre-auth 401.

## Commits

1. `phase-8a task 0: rate_limit_bucket schema + migration`
2. `phase-8a task 1: rateLimit.ts helper + 6 unit tests`
3. `phase-8a task 2: handler 429 IP+sub-key gates + Retry-After header + 4 E2E tests`
4. `docs: phase 8a plan`
