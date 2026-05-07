# Phase 8b — healthz/readyz Upgrade

**Goal:** Promote both health endpoints from placeholders to real liveness/readiness checks per spec §14, so an orchestrator (k8s, docker-compose, Caddy upstream) can reliably gate traffic.

**Architecture:**
- `/healthz` is liveness — does the process answer + can it talk to its primary dependency (DB). Returns 200 `{status:"ok"}` or 503 `{status:"down", reason:"db"}`.
- `/readyz` is readiness — DB ping AND a crypto self-test (encrypt+decrypt roundtrip via `MASTER_KEY_ENC_KEY`). The roundtrip proves the env var is a valid 32-byte AES key, which is cheaper than a DB sentinel row and equally diagnostic. Returns 200 `{status:"ready", checks:{db,crypto}}` or 503 `{status:"not_ready", checks:{...}}` with per-check error strings.

**Tech Stack:** Next.js 16 route handlers, Drizzle `db.execute(sql\`select 1\`)`, WebCrypto AES-GCM (existing `aesGcm.ts`).

---

### Task 0: `/healthz` real DB ping

**Files:** `src/app/api/healthz/route.ts`

Replace the trivial `Response.json({status:"ok"})` with a `SELECT 1` ping. Log the failure via the structured logger, return 503 with a `reason` field on error. Keep `dynamic = "force-dynamic"` so the route is never cached.

### Task 1: `/readyz` DB + crypto smoke

**Files:** `src/app/api/readyz/route.ts`

Run two checks in parallel via `Promise.all`:
1. DB ping (same as healthz).
2. Crypto roundtrip: `decrypt(encrypt("readyz-smoke")) === "readyz-smoke"`.

Both checks return `true | string` (the string is the error message). The handler maps that to a `checks` object where each key is `"ok"` or the error string. Status code is 200 only if both checks return `true`, otherwise 503.

### Task 2: Integration tests

**Files:** `tests/integration/health.test.ts` (new)

Two happy-path tests:
- `/healthz` returns 200 + `{status:"ok"}` against the test container DB.
- `/readyz` returns 200 + `{status:"ready", checks:{db:"ok", crypto:"ok"}}`.

No failure-path test for the crypto check — the crypto module memoizes the key on first import, so toggling `MASTER_KEY_ENC_KEY` at runtime doesn't actually exercise a different code path. The aesGcm module's own unit tests cover bad-key behavior.

### Task 3: Plan + ff-merge

Atomic commits per task, plan doc, exit worktree, ff-merge to main, remove worktree.

---

## Self-review

- Spec §14 coverage: ✅ both endpoints upgraded; readyz proves master key is configured.
- Crypto smoke choice: encrypt-decrypt roundtrip vs DB sentinel — picked roundtrip for simplicity. Trade-off: doesn't catch the case where the key is rotated and old envelopes can't decrypt. For that we'd need a sentinel row with a known-rotation-tracked envelope. Defer until rotation is implemented.
- No new schema, migrations, or env vars.
