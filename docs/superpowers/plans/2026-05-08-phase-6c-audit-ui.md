# Phase 6c — Audit Log UI Viewer

**Goal:** Surface the `audit.search` + `audit.stats` data shipped in 6b in a per-workspace page, with filter sidebar, paginated table, row expand, and URL state sync.

## Components

`src/components/feature/audit-log-viewer.tsx` — single client component:
- **Stats card** (8 tiles): total / 2xx / 4xx / 5xx / p50 / p95 / total denies / top deny reason. Pulls from `trpc.audit.stats.useQuery`. Period from current `from`/`to` filters; defaults to last 7 days when both absent.
- **Filter sidebar** (260px on `md+`, stacked on mobile): from / to (`<input type="datetime-local">`), sub-key `<select>` (lazy from `subKeys` prop), status range (`statusMin`/`statusMax` numeric inputs), deny reason `<select>` (six options matching `ProxyErrorCode`), pathContains text input. Apply button flushes the draft into "applied" state; Reset button clears both.
- **Paginated table**: TanStack/tRPC `useInfiniteQuery` against `audit.search`. Columns: when / method / path / status / verb / latency / deny. "Load more" button fetches next page when `nextCursor` exists.
- **Row expand**: click row → details list (request id, sub-key id, upstream status, has IP hash, query, user agent). Collapsed by default; only one row expanded at a time.
- **URL state sync**: applied filters serialised to query string via `router.replace` so views are shareable. Initial state read from `useSearchParams`.

`src/app/(app)/workspaces/[id]/audit/page.tsx` — server page mirroring the keys page:
- Auth guard + workspace ownership via `caller.workspace.list`.
- Pre-fetches the workspace's sub-keys for the sidebar `<select>`.
- Renders `<AuditLogViewer>` with `workspaceId`, `workspaceName`, and `subKeys`.

## Nav

`sub-keys-table.tsx` header gains a "View audit log" outlined button next to "Issue sub-key", linking to `/workspaces/{id}/audit`. Discoverable from the existing keys page.

## What's deliberately deferred

- **Virtual scroll** — spec §11 calls it out; phase 6c uses cursor-paginated "Load more" instead. The two scale roughly the same up to a few thousand rows; revisit if a real workspace approaches 10k entries per page session.
- **CSV export** — spec marks it stretch; not in scope.
- **Audit feed live updates** — refresh on Apply only; no auto-poll.

## Tests

UI components in this repo have no unit tests today; type-check + the existing E2E coverage on `audit.search`/`audit.stats` from phase 6b protects the contract. Manual smoke for the page render is the controller's responsibility (no `.env` in worktree).

Suite: 206 tests across 24 files, all green. Lint and typecheck clean.

## Commits

1. `phase-6c task 0: AuditLogViewer client component`
2. `phase-6c task 1: workspace audit page + nav link from keys page`
3. `docs: phase 6c plan`
