# Phase 5d — Reconcile Route Table With Real Weeek API Surface

**Goal:** Fix the route table, verb catalogue, and proxy rewrites to match the actual Weeek public API spec at `https://api.weeek.net/public/v1`. Phases 4/5a/5b/5c shipped against assumed REST conventions and got several things wrong.

## What was wrong

| Area | Phase 4/5a built | Weeek actually exposes |
|------|------------------|------------------------|
| Path prefix for projects/boards/tasks/custom-fields | `/ws/*` | `/tm/*` (Task Manager) |
| Update method | `PATCH` | `PUT` |
| Comments resource | `comments:read/write/delete` verbs + 3 routes | **Not exposed in public API at all** |
| Time entries | `/ws/time-entries` standalone list | nested under tasks: `/tm/tasks/{task_id}/time-entries` |
| `tasks:move` | `POST /ws/tasks/{id}/move` (one endpoint) | two endpoints: `POST /tm/tasks/{id}/board` + `POST /tm/tasks/{id}/board-column` |
| `tasks:complete` | `POST /ws/tasks/{id}/complete` | `POST /tm/tasks/{id}/complete` AND `/un-complete` |
| Visibility filter param | `assigneeId` | **`userId`** |
| Author rewrite body field | `assigneeId` | **`userId`** |

Members lives at `/ws/members` — that one was right.

## What this phase changes

- `src/server/verbs.ts` — drop `comments:read/write/delete` (3 verbs); update presets accordingly. Catalogue down 20→17.
- `src/server/proxy/types.ts` — `RouteEntry.method` adds `"PUT"` to the union.
- `src/server/proxy/routeTable.ts` — full rewrite. New entries:
  - Projects: GET/POST `/tm/projects`, GET/PUT/DELETE `/tm/projects/{id}`, POST `/tm/projects/{id}/archive` and `/un-archive`.
  - Boards: GET/POST `/tm/boards`, PUT/DELETE `/tm/boards/{id}`, POST `/tm/boards/{id}/move`.
  - Tasks: GET/POST `/tm/tasks`, GET/PUT/DELETE `/tm/tasks/{id}`, POST `/tm/tasks/{id}/complete`, `/un-complete`, `/board`, `/board-column`.
  - Members: GET `/ws/members`.
  - Custom fields: GET/POST `/tm/custom-fields`, PUT/DELETE `/tm/custom-fields/{id}` (DELETE maps to `custom_fields:write` — no separate `:delete` verb in spec).
  - Time entries: POST `/tm/tasks/{id}/time-entries`, PUT/DELETE `/tm/tasks/{id}/time-entries/{te_id}`.
- `src/server/proxy/rewrites.ts` — `ASSIGNEE_QUERY_PARAM` and `ASSIGNEE_BODY_FIELD` both `userId` now. TODO(verify) comment removed.
- `src/components/feature/identity-step.tsx` — updated copy (`userId` field name, dropped "comments" mention).
- Tests: `proxy-route-table.test.ts` rewritten for new paths/methods, snapshot regenerated. `proxy-handler.test.ts` URLs migrated `/ws/`→`/tm/`, `PATCH`→`PUT`, `assigneeId`→`userId`, `/move`→`/board` + new `/board-column` test. `proxy-rewrites.test.ts` `assigneeId`→`userId`. `verbs.test.ts` updated for dropped comments verbs.

## What this phase deliberately leaves out

Endpoints present in the spec but not added (backlog for a later "additional resources" phase):
- `/tm/portfolios` (TM portfolios with archive/un-archive)
- `/tm/board-columns` (separate resource — currently routes match the column endpoints inside tasks but board-columns top-level isn't proxied)
- `/ws/tags` (workspace tags)
- `/attachments/{id}` and `/tm/tasks/{task_id}/attachments`
- `/user/me`
- All of `/crm/*` (~40 endpoints — funnels, deals, contacts, organizations) — separate phase

Also still deferred:
- `subKey.update` (re-issue for changes)
- E2E proxy test for `403 project_not_in_scope` against a non-wildcard sub-key
- `/api/v1/[...path]` integration smoke against the real Weeek host

## Verification

- `pnpm test` — 172 across 20 files, all green (was 178; 6 fewer due to dropped comments verb tests + consolidated `tasks:move` route)
- `pnpm lint` clean
- `pnpm typecheck` clean

## Commits

Single phase, four atomic commits:
1. `phase-5d task 0: drop comments verbs from catalogue + presets`
2. `phase-5d task 1: rewrite route table for /tm/* prefix + PUT updates`
3. `phase-5d task 2: rewrites use userId (verified vs Weeek API spec)`
4. `phase-5d task 3+4: handler tests + wizard copy match real API`
