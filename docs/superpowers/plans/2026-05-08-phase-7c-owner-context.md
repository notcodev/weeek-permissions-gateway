# Phase 7c — Owner-Context Switcher + Plumbing

**Goal:** Replace the hard-coded `ownerType: 'user', ownerId: ctx.session.user.id` in every workspace-bound query with a context resolved from `session.session.activeOrganizationId`. When the session has an active org, all reads/writes target that org's resources; when null, the user's personal scope. Header gains a dropdown to switch.

## Helper

`src/server/trpc/ownerContext.ts`:
- `resolveOwnerContext(session) → OwnerContext` — reads `session.session.activeOrganizationId`. Null → user context. Non-null → looks up the user's `member` row for that org. Returns `{ownerType, ownerId, role}`. Throws `FORBIDDEN` when the active-org pointer is stale (user no longer a member); defence-in-depth so a UI race doesn't silently fall back to personal scope.
- `assertWriteRole(ctx, action)` — throws `FORBIDDEN` for `member` role in org context. No-op in personal scope. `WRITE_ROLES = ["owner", "admin"]`.

## Plumbing

Each affected router resolves the owner context once at the top of every procedure:

- **`workspace.list`** — filters by resolved `ownerType/ownerId`.
- **`workspace.import`** — `assertWriteRole`; rows insert with the resolved owner.
- **`workspace.remove`** — `assertWriteRole`; delete predicate uses resolved owner.
- **`subKey.listForWorkspace`** — passes context to `findOwnedWorkspaceId(workspaceId, owner)`.
- **`subKey.create`** — `assertWriteRole`; ownership lookup uses context.
- **`subKey.revoke`** — `assertWriteRole`; both UPDATE and fallback SELECT use context.
- **`subKey.get`** — read-only; no role gate, just context lookup.
- **`weeekDirectory.projects/boards/members`** — `loadMasterKey(workspaceId, session)` resolves context internally.
- **`audit.search/stats`** — `assertOwnership(workspaceId, session)` resolves context internally.

The `org` router itself doesn't take owner context — orgs are listed by user-membership directly.

## UI

`src/components/feature/owner-context-switcher.tsx`:
- Dropdown trigger shows `Context: Personal` or `Context: <Org name>`.
- Items: "Personal" + each org with role label.
- Click switches via `authClient.organization.setActive({organizationId})` (or `null` for personal). Calls `router.refresh()` so server components requery in the new scope.

`src/app/(app)/layout.tsx`:
- Resolves session in the layout (already did), now also calls `caller.org.list()` and reads `session.session.activeOrganizationId`. Passes to `<OwnerContextSwitcher>`.

## Tests

`tests/integration/owner-context.test.ts` — 5 tests:
- Personal workspaces invisible from org context (isolation).
- Org context import attaches workspace to the org (`ownerType: organization`).
- Org member without write role → FORBIDDEN on import.
- Stale `activeOrganizationId` → FORBIDDEN on list.
- Org member without write role → FORBIDDEN on `subKey.create`.

All pre-7c tests still pass because they fabricate sessions without `activeOrganizationId` → resolveOwnerContext falls back to user scope (existing behavior).

Total suite: 214 → 219 (+5). Lint and typecheck clean.

## What's deliberately deferred

- **Email-based invitation delivery.** Better Auth's `sendInvitationEmail` hook is unset; invitations are still created (status pending) but no email goes out. Tracked as backlog for a "transactional email" phase.
- **Profile page** with "unlink Google" / "delete account" actions — spec §11 mentions but unrelated to owner-context.
- **Workspaces showing both personal AND org** — current model treats them as orthogonal scopes. The switcher is the join.

## Phase 7 closed

7a + 7b + 7c done. The Better Auth org plugin is fully integrated, Google OAuth wired, owner-context switching works through every workspace-bound query.

## Commits

1. `phase-7c task 0: ownerContext helper + role gate`
2. `phase-7c task 1: workspace router uses resolveOwnerContext + assertWriteRole`
3. `phase-7c task 2: subKey router uses ownerContext + role gate on create/revoke`
4. `phase-7c task 3: weeekDirectory + audit routers use ownerContext`
5. `phase-7c task 4: owner-context switcher header + layout integration`
6. `phase-7c task 5: integration tests for owner-context plumbing`
7. `docs: phase 7c plan`
