# Phase 8c — Docker / Compose / Caddy

**Goal:** Single-host deployment story. `docker compose up -d --build` brings up Caddy (TLS), the Next.js app, and Postgres on one box, with auto-migration on first boot and HTTPS from Let's Encrypt.

**Architecture:**
- Multi-stage `Dockerfile` (deps → builder → runner) on `node:22-alpine`. Builder runs `next build` with `output: "standalone"` (already configured). Runner copies the standalone bundle plus a separate `_migrate/` directory containing full `node_modules` + drizzle config + schema sources, used by the entrypoint to run `drizzle-kit migrate` before `node server.js` starts.
- Build-time placeholder env vars unblock Next 16's static page-data collection: `db/client.ts` and `aesGcm.ts` both throw on missing env, so we feed dummy values that are syntactically valid (32-byte base64 keys, parseable Postgres URL) — the build never opens a connection or performs crypto.
- `docker-compose.yml` with three services on a `bridge` network: `postgres` (only reachable internally), `app` (only reachable via Caddy), `caddy` (the only thing exposing 80/443). Compose `?` interpolation forces every secret to be set or compose refuses to start.
- `Caddyfile` reverse-proxies `${DOMAIN}` to `app:3000` with HSTS (1y, preload-eligible), `X-Content-Type-Options`, `X-Frame-Options`, JSON access logs, h2/h3, and an upstream healthcheck against `/healthz`.

**Tech Stack:** Docker 24+, Compose v2, Caddy 2, Postgres 16 alpine, Node 22 alpine.

---

### Task 0: Multi-stage `Dockerfile` + entrypoint

**Files:** `Dockerfile`, `docker/entrypoint.sh`, `.dockerignore`

- `deps`: install via `corepack` + pnpm with a BuildKit cache mount on the pnpm store.
- `builder`: copy source, run `pnpm run build`, then re-install full deps and copy them aside to `/opt/full-node_modules` for the runner stage.
- `runner`: tini PID 1 + non-root `app` user, `HEALTHCHECK` curl-ing `/healthz`, entrypoint runs migrations then execs `node server.js`.
- Entrypoint honors `RUN_MIGRATIONS=0` so a read-replica or sidecar can skip.
- `.dockerignore` extended (.claude, .vscode, .idea, *.log, README.md, env files).

### Task 1: `docker-compose.yml` + `Caddyfile` + env example

**Files:** `docker-compose.yml`, `Caddyfile`, `.env.docker.example`

- Compose: postgres (named volume `pgdata`, healthcheck), app (depends_on healthy postgres, secrets via `${VAR:?}` interpolation), caddy (volumes for cert state, depends_on app).
- Internal `bridge` network; only caddy exposes 80/443.
- Caddyfile: auto-TLS (ACME email from env), HSTS+nosniff+frame-deny, h1/h2/h3, encode zstd/gzip, scrubs `Server` header, scrubs `X-Proxy-Upstream-Status` from `/api/v1/*` (defense-in-depth — handler.ts already does this).

### Task 2: Deploy README

**Files:** `docs/deploy.md`

Walk-through: prerequisites → genkey → `.env` setup → `up -d --build` → smoke checks against `/healthz` and `/readyz` → first admin sign-up → audit-retention cron → log rotation → backups → upgrades. Calls out `BETTER_AUTH_URL` MUST equal `https://${DOMAIN}` and that `MASTER_KEY_ENC_KEY` rotation strategy is out of scope.

### Task 3: Plan + ff-merge

Atomic commits per task, plan doc, exit worktree, ff-merge to main, cleanup.

---

## Self-review

- Build was tested locally: `docker build -t wgw-test .` succeeds, image is ~1.03 GB.
- Image size dominated by the `_migrate/node_modules` copy (~700 MB of dev deps for drizzle-kit). Acceptable for v1; can be slimmed later by extracting only drizzle-kit + postgres at the cost of a third install step.
- Runtime smoke (`docker compose up`) NOT tested in this phase — requires real `.env` with secrets. Documented in deploy.md instead.
- HSTS preload header is set; do NOT submit the domain to the HSTS preload list until the operator is sure the cert/domain are stable. Note this in deploy.md.
- DB build placeholder: postgres-js doesn't connect lazily until first query, so passing a fake DATABASE_URL through `next build` is safe.
- `output: "standalone"` was already configured pre-phase-8c; no next.config changes required.

## Deferred

- Multi-host / k8s manifests — not in scope for single-host compose.
- Image slimming via separate stage that installs only `drizzle-kit` + minimal deps for migrations.
- Private network egress hardening (e.g., Caddy-to-app on a Unix socket).
