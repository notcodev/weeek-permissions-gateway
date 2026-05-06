# Weeek Permissions Gateway — Design

**Status:** Draft
**Date:** 2026-05-06
**Owner:** erikcodev@gmail.com

## 1. Problem & Goal

Weeek API tokens are scoped to a workspace, act on behalf of the user who created
them, and **cannot be restricted in any way** — there are no native scopes, no
project/board limits, no expiration, no rotation, no audit. This makes them
unsafe to hand to integrations or third parties.

**Goal:** build a multi-tenant SaaS that sits between API consumers and Weeek as a
transparent reverse proxy. Users import a Weeek master token into the system,
then issue **sub-keys** with explicit, declarative permissions (allowed projects,
boards, verbs) and a binding to a specific Weeek user (for audit, author rewrite,
visibility filtering).

The system enforces every restriction at the proxy edge before any request
reaches Weeek.

## 2. Non-Goals (MVP)

- User-configurable per-key rate limits (we still apply a fixed coarse ceiling
  per sub-key for DoS protection — see §12 — but it is not exposed in the UI
  and not adjustable per key in MVP).
- IP allow-listing on sub-keys.
- Sub-key expiration (TTL).
- Field-level payload restrictions (e.g. "cannot set priority=high").
- Webhooks proxying.
- Per-key cost/usage billing.
- Static API docs / quick-start page (README in repo is enough).

## 3. Users & Tenancy

- **Personal account** — a single user owns workspaces and sub-keys directly.
- **Organization** — multiple users share workspaces and sub-keys via the
  Better Auth `organization` plugin. Roles: `owner`, `admin`, `member`.
  - `owner` / `admin`: full management (create workspaces, issue/revoke sub-keys,
    invite, see audit).
  - `member`: read-only by default. Cannot create or revoke sub-keys.
- A user can belong to N organizations and also keep personal-owned workspaces.
  The active "owner context" is selected via a top-bar switcher.

## 4. High-Level Architecture

```
┌─────────────────┐    ┌──────────────────────────────────────┐    ┌─────────────────┐
│ API client      │    │  Weeek Permissions Gateway (Next.js) │    │  Weeek API      │
│ (curl, скрипт,  │───▶│  ┌──────────┐  ┌─────────────────┐   │───▶│  api.weeek.net  │
│  интеграция)    │    │  │ /api/v1  │  │ tRPC + UI       │   │    │  /public/v1/*   │
└─────────────────┘    │  │  proxy   │  │ (admin panel)   │   │    └─────────────────┘
                       │  └────┬─────┘  └────────┬────────┘   │
                       │       │                 │            │
                       │       ▼                 ▼            │
                       │  ┌──────────────────────────────┐    │
                       │  │       PostgreSQL             │    │
                       │  │  users / orgs / workspaces / │    │
                       │  │  master_keys (encrypted) /   │    │
                       │  │  sub_keys / audit_log        │    │
                       │  └──────────────────────────────┘    │
                       └──────────────────────────────────────┘
```

A single Next.js process exposes two surfaces:

1. **Admin UI** — App Router pages + tRPC. Auth via Better Auth session cookie.
2. **Public Proxy API** — `app/api/v1/[...path]/route.ts` catch-all. Auth via
   `Authorization: Bearer <our_sub_key>`. Drop-in compatible with Weeek's URL
   shape and response schema.

External processes:

- **PostgreSQL** in its own container.
- **Caddy** as TLS-terminating reverse proxy in front of Next.js.
- **No Redis** in MVP — TTL caches and rate-limit windows live in Postgres.

## 5. Tech Stack

| Layer        | Choice                                                  |
|--------------|---------------------------------------------------------|
| Framework    | Next.js (App Router, Node runtime for proxy route)      |
| API (UI)     | tRPC + TanStack Query (`@trpc/react-query`, superjson)  |
| UI           | shadcn/ui + Tailwind                                    |
| Auth         | Better Auth (email+password + Google + organization plugin) |
| ORM          | Drizzle ORM                                             |
| DB           | PostgreSQL 16                                           |
| Validation   | Zod                                                     |
| Logging      | pino (structured JSON)                                  |
| Tests        | vitest, msw/nock, testcontainers                        |
| Container    | Docker + docker-compose (app + postgres + caddy)        |

## 6. Data Model

Schema below uses Drizzle conventions. Tables marked *(BA)* are managed by
Better Auth's core/organization plugins; we only consume them.

```
─── auth (BA) ──────────────────────────────────────────────────
user                  -- id, email, name, image, emailVerified
account               -- OAuth linkage (google), credential rows
session               -- session tokens
verification          -- email verify, password reset
organization          -- id, name, slug, logo
member                -- userId, organizationId, role
invitation            -- email, organizationId, role, expiresAt, status

─── domain ─────────────────────────────────────────────────────
weeek_workspace
  id (cuid)
  ownerType            'user' | 'organization'
  ownerId              user.id | organization.id
  weeekWorkspaceId     text  -- external Weeek id, nullable
  name                 text  -- our label
  masterKeyCiphertext  bytea -- AES-256-GCM
  masterKeyIv          bytea
  masterKeyTag         bytea
  masterKeyLast4       text
  masterKeyFingerprint bytea -- sha256(rawKey), unique per ownerId
  encVersion           int   -- enc-key generation, for rotation
  createdAt, updatedAt, lastVerifiedAt

weeek_workspace_cache                       -- TTL cache for UI lookups
  id, workspaceId, kind ('projects'|'boards'|'members')
  payload jsonb
  expiresAt timestamptz

sub_key
  id (cuid)
  workspaceId          fk weeek_workspace
  createdByUserId      fk user
  label                text
  prefix               text  -- 'wgw_'
  hash                 bytea -- HMAC-SHA256(rawKey, SUB_KEY_HMAC_PEPPER); UNIQUE
  last4                text
  status               'active' | 'revoked'
  revokedAt timestamptz, revokedByUserId
  boundWeeekUserId     text  -- Weeek member id (nullable but required for binding)
  boundWeeekUserName   text  -- denormalised for UI
  visibilityBound      bool  -- inject assignee filter on list endpoints
  authorRewrite        bool  -- inject author/createdBy on mutations
  scope_projects       text[] -- Weeek project ids; ['*'] = all
  scope_boards         text[] -- Weeek board ids;   ['*'] = all
  verbs                text[] -- catalogue from §7; deny by default
  createdAt, lastUsedAt, useCount

audit_log                                    -- monthly partitioned
  id bigserial
  ts timestamptz                             -- partition key
  subKeyId, workspaceId, ownerType, ownerId
  method, path, queryHash text
  upstreamStatus int                         -- nullable if denied before upstream
  ourStatus int
  denyReason text                            -- 'verb_missing','project_not_in_scope',...
  latencyMs int
  ipHash bytea                               -- sha256(client_ip)
  userAgent text
```

**Key decisions**

- Master key is **encrypted at rest** (AES-256-GCM) using `MASTER_KEY_ENC_KEY`
  from env. After write, plaintext is wiped from memory.
- Sub-keys are **never stored in raw form**. We persist only an HMAC-SHA256
  digest plus `last4` for display. The raw key is shown to the operator
  exactly once at issuance.
- `audit_log` is partitioned monthly to make retention (90 days default) a
  cheap `DROP TABLE` per old partition.
- `ipHash` is stored instead of the raw IP for privacy.

## 7. Permission Model

### 7.1 Verb catalogue (MVP)

| Resource      | read | write | delete | special                     |
|---------------|------|-------|--------|-----------------------------|
| projects      | ✓    | ✓     | ✓      | —                           |
| boards        | ✓    | ✓     | ✓      | —                           |
| tasks         | ✓    | ✓     | ✓      | `tasks:complete`, `tasks:move` |
| comments      | ✓    | ✓     | ✓      | —                           |
| members       | ✓    | —     | —      | (read-only via proxy)       |
| custom_fields | ✓    | ✓     | —      | —                           |
| time_entries  | ✓    | ✓     | ✓      | —                           |

`write` represents both create and update; we keep them merged in MVP. Splitting
to `:create` / `:update` is a future change with no migration risk.

The catalogue is finalised against the live Weeek surface during the first
implementation phase that wires the route table; any endpoints we discover that
do not fit the table above will trigger a catalogue addition through a code
review, not silent allow.

### 7.2 Sub-key policy

A sub-key is allow-listed by:

- `scope_projects: string[]` — Weeek project ids, or `['*']`.
- `scope_boards: string[]` — Weeek board ids, or `['*']`.
- `verbs: string[]` — explicit list. Anything not listed is denied.
- `boundWeeekUserId` — Weeek member id this key represents.
- `visibilityBound` — when true, list endpoints inject
  `assigneeId=<boundWeeekUserId>` upstream and post-filter responses.
- `authorRewrite` — when true, mutations inject the bound user as author /
  createdBy where the Weeek API supports it; never overwrites a user-supplied
  field.

### 7.3 Request lifecycle in the proxy

```
1. Auth
   - Extract Bearer → HMAC → lookup sub_key WHERE status='active'.
   - Miss → 401 unauthorized.

2. Route resolution
   - Match (method, path) against route table → {resource, verb, paramExtractor}.
   - No match → 403 unknown_route (deny by default).

3. Policy check
   - verb ∈ sub_key.verbs?           else 403 verb_missing
   - if path identifies a project: project_id ∈ scope_projects ∨ scope=['*']
                                     else 403 project_not_in_scope
   - if path identifies a board:   analogous → 403 board_not_in_scope
   - For list endpoints with non-wildcard scope:
       inject upstream filter (`projectIds=...`/`boardIds=...`) when supported,
       AND post-filter the response as a backstop.
   - If sub_key.visibilityBound and resource ∈ {tasks, comments, time_entries}:
       inject `assigneeId=<boundWeeekUserId>` on list endpoints.

4. Mutation rewrites
   - For POST/PATCH on tasks/comments: if authorRewrite is on AND the field is
     absent in the request body, inject boundWeeekUserId as author/createdBy.

5. Forward
   - Replace Authorization with the decrypted master key.
   - Stream body (no full buffering for >5 MB).
   - Timeout 15s. One retry on 5xx with jittered backoff. No retry on 4xx.

6. Response
   - Post-filter list responses to drop entities outside scope (defence in depth).
   - Stream body to client unchanged otherwise.
   - Append audit_log row asynchronously (best-effort, never blocks the response).
```

All denials happen **before** any call to Weeek.

## 8. Authentication Surface (Admin)

- Email + password (Better Auth `emailAndPassword`) with mandatory email
  verification.
- Google OAuth (Better Auth `socialProviders.google`).
- Organization plugin enabled with `owner | admin | member` roles.
- Sessions: cookie-based, `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Lax`.
- CSRF: Better Auth token + `Origin` check on tRPC mutations.
- Better Auth's built-in rate limiter is enabled on auth endpoints.

## 9. tRPC API (admin)

```
appRouter
├─ workspace
│   ├─ list({ ownerType, ownerId })
│   ├─ import({ ownerType, ownerId, masterKey, name })   -- validates key, encrypts, stores
│   ├─ rotate({ workspaceId, masterKey })
│   ├─ remove({ workspaceId })
│   └─ refreshCache({ workspaceId, kind })
├─ subKey
│   ├─ listForWorkspace({ workspaceId })
│   ├─ create(input) → { id, rawKey }                    -- rawKey returned exactly once
│   ├─ update({ id, label?, scope?, verbs?, binding? })  -- never rotates rawKey
│   ├─ revoke({ id })
│   └─ get({ id })
├─ weeekDirectory                                         -- on-demand calls into Weeek
│   ├─ projects({ workspaceId })
│   ├─ boards({ workspaceId, projectId })
│   └─ members({ workspaceId })
├─ audit
│   ├─ search({ workspaceId, subKeyId?, period, status?, denyReason?, pathContains? })
│   └─ stats({ workspaceId, period })
└─ org                                                    -- thin wrapper over Better Auth org plugin
    ├─ list / create / invite / acceptInvite / removeMember / leave
```

Each procedure runs an authorisation check based on `ctx.user`, the resource's
`ownerType`/`ownerId`, and (for organisations) the user's role.

## 10. Public Proxy API

- Route: `app/api/v1/[...path]/route.ts` catch-all, methods `GET POST PATCH DELETE`.
- Auth: `Authorization: Bearer wgw_<...>`.
- Body limit: 10 MB streamed.
- Error envelope on our denials:
  ```json
  {
    "error": {
      "code": "verb_missing|project_not_in_scope|board_not_in_scope|unknown_route|upstream_error|...",
      "message": "Human-readable",
      "subKeyId": "<short>",
      "requestId": "<uuid>"
    }
  }
  ```
- Upstream 4xx/5xx responses are passed through unchanged (transparent proxy).
  Only when the upstream call itself fails (timeout, network) do we return our
  own `502 upstream_error`.

## 11. UI / UX Flows

### Frontend pages

1. Sign-in / sign-up.
2. Dashboard — list of workspaces in the current owner context.
3. Workspace detail — sub-key list + "Issue sub-key" CTA.
4. Sub-key issuance wizard (4 steps: identity, scope, verbs, review).
5. Sub-key detail — scope, last used, "Revoke".
6. Audit log viewer (table with virtual scroll + filter sidebar).
7. Organisation settings — members, invitations, roles.
8. Profile — change password, unlink Google, delete account.

(API docs page is out of MVP scope; README covers integration.)

### Sub-key issuance — wizard

1. **Identity** — label; pick bound Weeek user (combobox, lazy-loaded members);
   toggles for "use as default author" and "filter visibility to this user".
2. **Scope** — projects multi-select (or "all"), boards multi-select scoped to
   chosen projects (or "all").
3. **Verbs** — resource × action matrix with presets `Read-only`,
   `Task automator`, `Full access`.
4. **Review & create** — JSON preview of the policy. On confirm, server returns
   `{ id, rawKey }`. UI shows a one-time reveal modal with a copy button and a
   loud disclaimer. Closing the modal is final.

### Revoke

Row action → AlertDialog ("This is irreversible. Integrations using this key
will fail immediately.") → `subKey.revoke` → optimistic update → server flips
`status='revoked'`. Subsequent proxy requests with that key return 401.

### Audit log

Filters: period, sub-key, HTTP status range, method, denyReason, path contains.
URL state is synchronised so filtered views are shareable. Each row expands to
show full request metadata (method, path, query, status, latency, denyReason,
ipHash, userAgent). CSV export is a stretch goal — drop if it slips past phase 6.

## 12. Security

- **Sub-key wire format**: `wgw_<base64url(32 random bytes)>`. The `wgw_`
  prefix lets the proxy reject malformed bearers cheaply.
- **Sub-key storage**: HMAC-SHA256(rawKey, `SUB_KEY_HMAC_PEPPER`) — pepper
  lives in env, separate from the encryption key. No reversible storage.
- **Master-key storage**: AES-256-GCM with `MASTER_KEY_ENC_KEY` (32 bytes,
  base64 in env). `encVersion` column supports staged rotation.
- **Logging**: pino JSON, never includes Authorization, raw keys, master keys,
  or full request bodies.
- **TLS**: terminated at Caddy. HSTS, TLS 1.2/1.3 only.
- **Coarse DoS protection**: 60 req/min per client IP and 600 req/min per
  sub-key, both enforced via a sliding-window counter in Postgres
  (`(bucket, key) → count`). 429 with `Retry-After` on breach.
- **Validation**: Zod on every tRPC input. Proxy paths must match exactly one
  route-table entry; non-matching paths return 403 `unknown_route`.

## 13. Error Handling Summary

| Scenario                              | Status       | denyReason / code         |
|--------------------------------------|--------------|---------------------------|
| Missing/garbled bearer                | 401          | `unauthenticated`         |
| Sub-key revoked or unknown            | 401          | `unauthenticated`         |
| Verb not in sub-key                   | 403          | `verb_missing`            |
| Project outside scope                 | 403          | `project_not_in_scope`    |
| Board outside scope                   | 403          | `board_not_in_scope`      |
| Unknown route                         | 403          | `unknown_route`           |
| Body too large                        | 413          | `body_too_large`          |
| Coarse rate-limit hit                 | 429          | `rate_limited`            |
| Upstream timeout / network failure    | 502          | `upstream_error`          |
| Upstream Weeek 4xx/5xx                | passthrough  | (Weeek's own body)        |

## 14. Observability

- Structured pino logs with `requestId`, `subKeyId`, `ourStatus`,
  `upstreamStatus`, `latencyMs`, `denyReason`. Never PII or secrets.
- `/healthz` — DB ping. `/readyz` — DB ping + master-key decrypt smoke test
  on a sentinel row.
- (Phase 2) `/metrics` for Prometheus.
- (Optional) Sentry for UI errors, gated by env flag.

## 15. Testing Strategy

- **Unit**: route-table mapper, policy evaluator, payload rewriter, AES-GCM
  helpers, HMAC helpers (vitest).
- **Integration**: tRPC routers against testcontainers Postgres; Better Auth
  flow with a mocked Google provider.
- **E2E proxy**: msw mocks Weeek upstream and runs a matrix of
  (verb × scope × method × path) → expected allow/deny. Target ≥ 90 % rule
  coverage.
- **Snapshot test for the route table** to surface accidental drift when new
  endpoints are added.

## 16. Repository Layout

```
weeek-api-permissions/
├── docker-compose.yml            # app + postgres + caddy
├── Dockerfile                    # multi-stage: deps → build → runtime
├── caddy/Caddyfile
├── .env.example
├── drizzle.config.ts
├── next.config.mjs
├── package.json
│
├── src/
│   ├── app/
│   │   ├── (marketing)/page.tsx
│   │   ├── (auth)/sign-in/page.tsx
│   │   ├── (auth)/sign-up/page.tsx
│   │   ├── (app)/
│   │   │   ├── layout.tsx
│   │   │   ├── workspaces/{page.tsx, [id]/{page.tsx, audit/page.tsx, keys/page.tsx, settings/page.tsx}}
│   │   │   └── orgs/{page.tsx, [id]/page.tsx}
│   │   └── api/
│   │       ├── auth/[...all]/route.ts
│   │       ├── trpc/[trpc]/route.ts
│   │       └── v1/[...path]/route.ts
│   │
│   ├── server/
│   │   ├── auth.ts
│   │   ├── db/{client.ts, schema/*.ts, migrations/}
│   │   ├── trpc/{init.ts, routers/*.ts, procedures.ts}
│   │   ├── proxy/{routeTable.ts, policyEval.ts, payloadRewriter.ts, upstream.ts, audit.ts, handler.ts}
│   │   ├── crypto/{aesGcm.ts, hmac.ts, randomKey.ts}
│   │   ├── weeek/{client.ts, types.ts}
│   │   └── ratelimit.ts
│   │
│   ├── components/
│   │   ├── ui/                              # shadcn-generated
│   │   └── feature/{WorkspaceCard, SubKeyWizard, AuditTable, ScopePicker, VerbMatrix, ...}
│   │
│   └── lib/{utils.ts, trpc-client.ts, query-client.ts, zod-schemas/}
│
├── tests/{unit, integration, e2e}/
└── scripts/{genkey.ts, seed-dev.ts, route-table-snapshot.ts}
```

## 17. Deployment

`docker-compose.yml` (sketch):

```yaml
services:
  app:
    build: .
    env_file: .env
    depends_on: [postgres]
    expose: ["3000"]
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: weeek_perm
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes: ["pgdata:/var/lib/postgresql/data"]
  caddy:
    image: caddy:2-alpine
    ports: ["443:443", "80:80"]
    volumes:
      - "./caddy/Caddyfile:/etc/caddy/Caddyfile"
      - "caddy_data:/data"
volumes:
  pgdata: {}
  caddy_data: {}
```

Required environment variables:

| Var                       | Purpose                                      |
|---------------------------|----------------------------------------------|
| `DATABASE_URL`            | Postgres DSN                                 |
| `BETTER_AUTH_SECRET`      | Better Auth signing secret                   |
| `BETTER_AUTH_URL`         | Public base URL                              |
| `GOOGLE_CLIENT_ID`        | OAuth                                        |
| `GOOGLE_CLIENT_SECRET`    | OAuth                                        |
| `MASTER_KEY_ENC_KEY`      | 32 random bytes (base64) for AES-GCM         |
| `SUB_KEY_HMAC_PEPPER`     | 32 random bytes (base64) for sub-key hashing |
| `WEEEK_API_BASE`          | e.g. `https://api.weeek.net/public/v1`       |
| `AUDIT_RETENTION_DAYS`    | Default `90`                                 |
| `LOG_LEVEL`               | `info` by default                            |

Local dev:

1. `cp .env.example .env`; `pnpm scripts/genkey` to fill `MASTER_KEY_ENC_KEY`
   and `SUB_KEY_HMAC_PEPPER`.
2. `docker compose up -d postgres`.
3. `pnpm drizzle-kit migrate && pnpm seed-dev`.
4. `pnpm dev` → http://localhost:3000.

## 18. Implementation Phases

The plan skill will turn these into concrete tasks; this is the intended order.

1. Skeleton: Next.js, Better Auth (email+password only), Drizzle, base schema.
2. Workspace import: master-key crypto (AES-GCM), validation against Weeek,
   minimal `workspaces` UI (list/add/remove).
3. Sub-key issuance v0: HMAC storage, `wgw_` format, one-time reveal, revoke.
   Verbs catalogue stub; scope `['*']` only.
4. Route table + policy evaluator + proxy handler for read verbs across
   projects/boards/tasks/comments/members/custom_fields/time_entries.
5. Write/delete verbs + payload rewriter (author rewrite, visibility binding).
6. Audit log: schema, async write path, retention cron, UI viewer.
7. Organisation plugin + Google OAuth + owner-context switcher.
8. Hardening: coarse rate limits, healthz/readyz, Caddy + Docker compose,
   README, CI pipeline.

## 19. Open Questions

- Final mapping of Weeek endpoints to `(resource, verb)` pairs is locked in
  during phase 4; any endpoint not in the catalogue stays denied until added.
- Confirm Weeek's exact request shape for author override on task/comment
  creation. If the API does not expose such a field, `authorRewrite` becomes
  a no-op and the binding only powers visibility filtering and audit.
- Confirm the actual Weeek query parameter name used to filter by assignee on
  list endpoints (`assigneeId`, `userId`, `assignees[]`, …). The visibility
  injection in §7.3 uses `assigneeId` as a placeholder; it is locked to the real
  parameter during phase 4 against the live route table.
- The route table in §7 is built and verified in phase 4 of §18 by traversing
  the live Weeek API surface. Any endpoint not classified at that point stays
  in the deny-by-default `unknown_route` bucket until added.
