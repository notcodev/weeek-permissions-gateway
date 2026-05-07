# Phase 7b — Better Auth Organization Plugin + tRPC Wrappers

**Goal:** Enable Better Auth's `organization()` plugin so users can group themselves into organisations, and surface a thin `org.*` tRPC router so the dashboard can list/create orgs and manage members. Sets up the data layer phase 7c needs to plumb owner-context through every workspace-bound query.

## Schema

`src/server/db/schema/org.ts` — three new tables matching Better Auth's plugin contract verbatim:

- `organization` (id, name, slug unique, logo?, metadata?, createdAt)
- `member` (id, userId FK→user, organizationId FK→organization, role, createdAt; (org,user) unique)
- `invitation` (id, email, inviterId FK→user, organizationId FK→organization, role?, status, expiresAt, createdAt)

All FKs cascade on delete so removing a user cleans up memberships and invitations.

`session` gains an `activeOrganizationId text` column (nullable) — Better Auth writes it when the user switches owner-context.

Migration: `0004_fresh_hardball.sql`.

## Better Auth wiring

`src/server/auth.ts` adds `organization()` plugin and points the Drizzle adapter at the new schemas. `src/lib/auth-client.ts` adds `organizationClient()` so client components can use `authClient.organization.*`.

## tRPC `org` router

`src/server/trpc/routers/org.ts`. Six procedures:

- `list()` — direct Drizzle query joining `member` + `organization` for the current user. Doesn't go through `auth.api.*` because that path requires session cookies that server-component-built sessions don't carry.
- `create({ name, slug })` — calls `auth.api.createOrganization` with the server-only `userId` parameter so it works without session cookies. `slug` validated by regex (lowercase letters/digits/hyphens; 2–64 chars; no leading/trailing dash).
- `invite({ organizationId, email, role })` — owner/admin role gate via local `assertMembership`, then forwards to `auth.api.createInvitation`. Rejects with `FORBIDDEN` for member callers.
- `acceptInvite({ invitationId })` — forwards to `auth.api.acceptInvitation`.
- `removeMember({ organizationId, memberIdOrEmail })` — owner/admin role gate, then forwards.
- `leave({ organizationId })` — forwards to `auth.api.leaveOrganization`.

Local `assertMembership` keeps the role gate close to the data, so test fixtures can drive it directly without spinning up a real Better Auth session for unit-style coverage of the FORBIDDEN paths.

## UI

`src/app/(app)/accept-invitation/[id]/page.tsx` — auth-guarded server page (redirects to `/sign-in?redirect=...` when no session). Renders `AcceptInvitationForm` with the invitation id from the URL. The form calls `trpc.org.acceptInvite.mutate({invitationId})` and routes to `/dashboard` on success.

## Tests

`tests/integration/org-router.test.ts` — 8 tests:
- list: ordered/isolated/empty
- create: round-trip with role assertion (`owner`); slug regex rejection
- removeMember: role gate (member → FORBIDDEN); unknown org (NOT_FOUND)
- invite: role gate (member → FORBIDDEN)

Tests fabricate sessions through `appRouter.createCaller` with a fake session object. Better Auth API calls that need real session cookies (`acceptInvite`/`leave`) are not exercised end-to-end here — those are thin forwarders to Better Auth's own well-tested plugin and a manual smoke covers the round-trip.

Total suite: 206 → 214 (+8). Lint and typecheck clean.

## What's deferred to 7c

- Owner-context switcher header dropdown.
- Plumbing `ownerType: 'user' | 'organization'` + `ownerId` through `workspace.list/import/remove`, `subKey.*`, `weeekDirectory.*`, `audit.*`. All those routers currently hard-code `ownerType: 'user', ownerId: ctx.session.user.id`.
- Role gates on workspace-bound mutations (members can list, owner+admin can manage).
- Setting `activeOrganizationId` from the UI via `authClient.organization.setActive`.
- Email-based invitation delivery (Better Auth fires hooks; our `sendInvitationEmail` is unset → invitations created but no email sent yet).

## Commits

1. `phase-7b task 0: org/member/invitation schemas + session.activeOrganizationId + migration`
2. `phase-7b task 1: enable Better Auth organization() plugin server + client`
3. `phase-7b task 2: org tRPC router (list/create/invite/acceptInvite/removeMember/leave) + tests`
4. `phase-7b task 3: accept-invitation page (auth-guarded) + client form`
5. `docs: phase 7b plan`
