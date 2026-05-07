# Phase 5c — Identity Binding + Payload Rewrites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `boundWeeekUserId` / `visibilityBound` / `authorRewrite` end-to-end. Wizard gains member picker + 2 toggles. Proxy gains two rewrites: assignee-filter injection on list endpoints, author rewrite on POST/PATCH JSON bodies. Both are gated on the per-sub-key flags and on route-level capability flags.

**Architecture:**
- New `weeekDirectory.members` tRPC procedure built on the existing `getOrFetch` cache + `fetchMembers` wrapper.
- `RouteEntry` gains optional `flags` object: `{ listEndpoint?: boolean; authorRewritable?: boolean }`. Read-list routes that should accept assignee filtering set `listEndpoint`. Write routes on tasks/comments that accept author override set `authorRewritable`.
- Proxy `handler.ts` calls two new helpers `applyVisibilityFilter(url, route, authed)` and `rewriteAuthor(req, route, authed)` between policy and forward. Both are no-ops when flags are off.
- `subKey.create` accepts `boundWeeekUserId`, `boundWeeekUserName`, `visibilityBound`, `authorRewrite`. Defaults preserve current behaviour (null/false).
- Wizard step 1 (Identity) gains a member `<select>` + 2 toggles. Member picker is optional; toggles only matter when a member is picked.

**Spec §19 open questions resolved by assumption:**
- Assignee filter query param: `assigneeId` (matches §7.3 placeholder).
- Author rewrite body field: `assigneeId` (consistent with the filter param; the most likely Weeek field given REST conventions).
- Both names live as single-source-of-truth constants in `src/server/proxy/rewrites.ts` (`ASSIGNEE_QUERY_PARAM`, `ASSIGNEE_BODY_FIELD`) flagged with `TODO(verify)` so a single edit reconciles with Weeek docs once consulted.

**Tech Stack:** existing. No new shadcn primitives — Identity step uses native `<select>` for the member picker.

---

## File Structure

| Path | Change |
|------|--------|
| `src/server/weeek/directory.ts` | EXTEND — add `fetchMembers(masterKey)` |
| `src/server/trpc/routers/weeekDirectory.ts` | EXTEND — add `members({workspaceId})` procedure |
| `src/server/proxy/types.ts` | EXTEND — `AuthedRequest` gains `boundWeeekUserId`, `visibilityBound`, `authorRewrite`. `RouteEntry` gains optional `flags` |
| `src/server/proxy/auth.ts` | EXTEND — populate the new `AuthedRequest` fields from the sub-key row |
| `src/server/proxy/routeTable.ts` | EXTEND — flag list endpoints (`listEndpoint`) and author-rewritable endpoints (`authorRewritable`) |
| `src/server/proxy/rewrites.ts` | NEW — `applyVisibilityFilter`, `rewriteAuthor`, single-source constants |
| `src/server/proxy/handler.ts` | MODIFY — call both rewrites before forward |
| `src/server/trpc/routers/subKey.ts` | EXTEND — accept binding inputs, default null/false |
| `src/components/feature/identity-step.tsx` | NEW — member select + 2 toggles |
| `src/components/feature/issue-sub-key-dialog.tsx` | MODIFY — wire identity-step state into create mutation |
| `tests/unit/proxy-rewrites.test.ts` | NEW — pure logic tests for both rewrites |
| `tests/integration/weeek-directory.test.ts` | EXTEND — `members` happy + ownership |
| `tests/integration/sub-key-router.test.ts` | EXTEND — binding fields persisted |
| `tests/integration/proxy-handler.test.ts` | EXTEND — visibility filter + author rewrite E2E + flags off no-op |

---

## Task 0: types — extend `AuthedRequest` and `RouteEntry`

**Files:**
- Modify: `src/server/proxy/types.ts`

- [ ] **Step 1: Edit `AuthedRequest`** — add three fields after `scopeBoards`:

```ts
export type AuthedRequest = {
  subKeyId: string;
  subKeyShortId: string;
  workspaceId: string;
  verbs: readonly string[];
  scopeProjects: readonly string[];
  scopeBoards: readonly string[];
  boundWeeekUserId: string | null;
  visibilityBound: boolean;
  authorRewrite: boolean;
  masterKey: string;
};
```

- [ ] **Step 2: Edit `RouteEntry`** — add optional `flags`:

```ts
export type RouteEntry = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  pattern: RegExp;
  resource: ResourceKind;
  verb: Verb;
  extractParams: (match: RegExpMatchArray, search: URLSearchParams) => RouteParams;
  flags?: {
    /** List endpoint that supports the visibility (assignee) filter injection. */
    listEndpoint?: boolean;
    /** Write endpoint that supports the author rewrite when authorRewrite is on. */
    authorRewritable?: boolean;
  };
};
```

- [ ] **Step 3: lint+typecheck clean**

`pnpm lint && pnpm typecheck`
(Existing tests will start failing until task 1 wires `auth.ts` — that's fine, run the full suite after task 1.)

- [ ] **Step 4: Commit**

```bash
git add src/server/proxy/types.ts
git commit -m "phase-5c task 0: extend AuthedRequest with binding + RouteEntry flags"
```

---

## Task 1: `auth.ts` populates binding fields from the row

**Files:**
- Modify: `src/server/proxy/auth.ts`

- [ ] **Step 1**: In `authenticateBearer`, after the destructure of `row.sk`, plumb:

```ts
return {
  kind: "ok",
  authed: {
    subKeyId: row.sk.id,
    subKeyShortId: row.sk.id.slice(0, 8),
    workspaceId: row.ws.id,
    verbs: row.sk.verbs,
    scopeProjects: row.sk.scopeProjects,
    scopeBoards: row.sk.scopeBoards,
    boundWeeekUserId: row.sk.boundWeeekUserId,
    visibilityBound: row.sk.visibilityBound,
    authorRewrite: row.sk.authorRewrite,
    masterKey,
  },
};
```

- [ ] **Step 2: Run full test suite** — sub-key router tests should still pass; proxy auth tests should still pass (they don't assert these fields yet).

`pnpm test`

- [ ] **Step 3: lint+typecheck**

- [ ] **Step 4: Commit**

```bash
git add src/server/proxy/auth.ts
git commit -m "phase-5c task 1: auth.ts plumbs binding fields into AuthedRequest"
```

---

## Task 2: `weeekDirectory.members` tRPC + fetcher

**Files:**
- Modify: `src/server/weeek/directory.ts` — add `fetchMembers`
- Modify: `src/server/trpc/routers/weeekDirectory.ts` — add `members` procedure
- Modify: `tests/integration/weeek-directory.test.ts` — add 2 tests

- [ ] **Step 1: extend tests** — append inside the existing `describe("weeekDirectory router", ...)` block:

```ts
  test("members: returns list and caches", async () => {
    const { _resetCacheForTests } = await import("@/server/weeek/cache");
    _resetCacheForTests();
    const seeded = await setup();
    let calls = 0;
    server.use(
      http.get(`${WEEEK_BASE}/ws/members`, () => {
        calls += 1;
        return HttpResponse.json({ members: [{ id: "u1", name: "Alice" }] });
      }),
    );
    const a = await seeded.caller.weeekDirectory.members({ workspaceId: seeded.workspaceId });
    const b = await seeded.caller.weeekDirectory.members({ workspaceId: seeded.workspaceId });
    expect(a).toEqual([{ id: "u1", name: "Alice" }]);
    expect(b).toEqual([{ id: "u1", name: "Alice" }]);
    expect(calls).toBe(1);
  });

  test("members: NOT_FOUND for someone else's workspace", async () => {
    const a = await setup();
    const b = await setup();
    await expect(
      b.caller.weeekDirectory.members({ workspaceId: a.workspaceId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
```

- [ ] **Step 2: extend `directory.ts`**:

```ts
export type WeeekMemberRow = { id: number | string; name: string; email?: string };

export async function fetchMembers(masterKey: string): Promise<WeeekMemberRow[]> {
  const env = await callWeeek<unknown>("/ws/members", masterKey);
  return unwrap<WeeekMemberRow>(env, ["members", "data"]);
}
```

(`callWeeek` and `unwrap` already exist from 5b.)

- [ ] **Step 3: extend `weeekDirectory.ts`** — add a third procedure:

```ts
import { fetchBoards, fetchMembers, fetchProjects } from "@/server/weeek/directory";
// ... existing code unchanged
const membersInput = z.object({ workspaceId: z.string().min(1) });

export const weeekDirectoryRouter = router({
  // ... existing projects + boards procedures
  members: protectedProcedure.input(membersInput).query(async ({ ctx, input }) => {
    const masterKey = await loadMasterKey(input.workspaceId, ctx.session.user.id);
    return getOrFetch(`members:${input.workspaceId}`, TTL_MS, () => fetchMembers(masterKey));
  }),
});
```

- [ ] **Step 4: run tests**

`pnpm vitest run tests/integration/weeek-directory.test.ts` — 6/6 (existing 4 + 2 new).

- [ ] **Step 5: lint+typecheck**

- [ ] **Step 6: Commit**

```bash
git add src/server/weeek/directory.ts src/server/trpc/routers/weeekDirectory.ts tests/integration/weeek-directory.test.ts
git commit -m "phase-5c task 2: weeekDirectory.members + fetchMembers"
```

---

## Task 3: `subKey.create` accepts binding inputs

**Files:**
- Modify: `src/server/trpc/routers/subKey.ts`
- Modify: `tests/integration/sub-key-router.test.ts`

- [ ] **Step 1: extend tests** — append inside the existing describe:

```ts
  test("create with binding fields persists boundWeeekUserId/Name + flags", async () => {
    const uid = `sk-user-${Date.now()}-bind`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS bind");
    const caller = await makeCaller(uid);
    const created = await caller.subKey.create({
      workspaceId: wsId,
      label: "bound",
      preset: "task-automator",
      boundWeeekUserId: "u-42",
      boundWeeekUserName: "Alice",
      visibilityBound: true,
      authorRewrite: true,
    });
    expect(created.subKey.boundWeeekUserId).toBe("u-42");
    expect(created.subKey.boundWeeekUserName).toBe("Alice");
    expect(created.subKey.visibilityBound).toBe(true);
    expect(created.subKey.authorRewrite).toBe(true);
  });

  test("create defaults binding fields to null/false when omitted", async () => {
    const uid = `sk-user-${Date.now()}-bind-default`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS bind default");
    const caller = await makeCaller(uid);
    const created = await caller.subKey.create({
      workspaceId: wsId,
      label: "no bind",
      preset: "read-only",
    });
    expect(created.subKey.boundWeeekUserId).toBeNull();
    expect(created.subKey.boundWeeekUserName).toBeNull();
    expect(created.subKey.visibilityBound).toBe(false);
    expect(created.subKey.authorRewrite).toBe(false);
  });
```

- [ ] **Step 2: edit `createInput`** — add to the `z.object`:

```ts
const createInput = z.object({
  workspaceId: z.string().min(1),
  label: z.string().trim().min(1, "Label is required").max(80),
  preset: presetEnum,
  scopeProjects: scopeArrayInput.optional(),
  scopeBoards: scopeArrayInput.optional(),
  boundWeeekUserId: z.string().min(1).nullable().optional(),
  boundWeeekUserName: z.string().min(1).max(120).nullable().optional(),
  visibilityBound: z.boolean().optional(),
  authorRewrite: z.boolean().optional(),
});
```

- [ ] **Step 3: edit the insert** — add to `.values({...})`:

```ts
boundWeeekUserId: input.boundWeeekUserId ?? null,
boundWeeekUserName: input.boundWeeekUserName ?? null,
visibilityBound: input.visibilityBound ?? false,
authorRewrite: input.authorRewrite ?? false,
```

- [ ] **Step 4: run sub-key tests** — `pnpm vitest run tests/integration/sub-key-router.test.ts` — 15/15.

- [ ] **Step 5: lint+typecheck**

- [ ] **Step 6: Commit**

```bash
git add src/server/trpc/routers/subKey.ts tests/integration/sub-key-router.test.ts
git commit -m "phase-5c task 3: subKey.create accepts binding fields (boundWeeekUserId, visibilityBound, authorRewrite)"
```

---

## Task 4: route-table flags

**Files:**
- Modify: `src/server/proxy/routeTable.ts`
- Modify: `tests/unit/proxy-route-table.test.ts`
- Update: snapshot

- [ ] **Step 1: extend tests** — append inside describe:

```ts
  test("GET /ws/tasks is flagged listEndpoint", () => {
    const m = matchRoute("GET", "/ws/tasks", new URLSearchParams());
    expect(m?.entry.flags?.listEndpoint).toBe(true);
  });

  test("GET /ws/tasks/abc is NOT flagged listEndpoint", () => {
    const m = matchRoute("GET", "/ws/tasks/abc", new URLSearchParams());
    expect(m?.entry.flags?.listEndpoint).toBeFalsy();
  });

  test("GET /ws/tasks/abc/comments is flagged listEndpoint", () => {
    const m = matchRoute("GET", "/ws/tasks/abc/comments", new URLSearchParams());
    expect(m?.entry.flags?.listEndpoint).toBe(true);
  });

  test("GET /ws/time-entries is flagged listEndpoint", () => {
    const m = matchRoute("GET", "/ws/time-entries", new URLSearchParams());
    expect(m?.entry.flags?.listEndpoint).toBe(true);
  });

  test("POST /ws/tasks is flagged authorRewritable", () => {
    const m = matchRoute("POST", "/ws/tasks", new URLSearchParams());
    expect(m?.entry.flags?.authorRewritable).toBe(true);
  });

  test("PATCH /ws/tasks/abc is flagged authorRewritable", () => {
    const m = matchRoute("PATCH", "/ws/tasks/abc", new URLSearchParams());
    expect(m?.entry.flags?.authorRewritable).toBe(true);
  });

  test("POST /ws/tasks/abc/comments is flagged authorRewritable", () => {
    const m = matchRoute("POST", "/ws/tasks/abc/comments", new URLSearchParams());
    expect(m?.entry.flags?.authorRewritable).toBe(true);
  });

  test("DELETE /ws/tasks/abc is NOT flagged authorRewritable", () => {
    const m = matchRoute("DELETE", "/ws/tasks/abc", new URLSearchParams());
    expect(m?.entry.flags?.authorRewritable).toBeFalsy();
  });
```

- [ ] **Step 2: tag the relevant entries in `routeTable.ts`** — add `flags: { listEndpoint: true }` to:
- `GET /ws/tasks`
- `GET /ws/tasks/{id}/comments`
- `GET /ws/time-entries`

Add `flags: { authorRewritable: true }` to:
- `POST /ws/tasks`
- `PATCH /ws/tasks/{id}`
- `POST /ws/tasks/{id}/comments`
- `PATCH /ws/tasks/{id}/comments/{id}`

(Other endpoints stay unflagged. `GET /ws/projects` and `GET /ws/boards` are NOT flagged listEndpoint — assignee filter only applies per spec to tasks/comments/time_entries.)

- [ ] **Step 3: rebuild snapshot + verify**

```
pnpm vitest run tests/unit/proxy-route-table.test.ts -u
pnpm vitest run tests/unit/proxy-route-table.test.ts
```

Expected: 35 (existing) + 8 (new) = 43 tests.

- [ ] **Step 4: lint+typecheck**

- [ ] **Step 5: Commit**

```bash
git add src/server/proxy/routeTable.ts tests/unit/proxy-route-table.test.ts tests/unit/__snapshots__/proxy-route-table.test.ts.snap
git commit -m "phase-5c task 4: route-table flags listEndpoint + authorRewritable"
```

---

## Task 5: `rewrites.ts` — pure logic for both rewrites

**Files:**
- Create: `src/server/proxy/rewrites.ts`
- Test: `tests/unit/proxy-rewrites.test.ts`

- [ ] **Step 1: failing test**

```ts
import { describe, expect, test } from "vitest";
import { applyVisibilityFilter, rewriteAuthor } from "@/server/proxy/rewrites";
import type { AuthedRequest, RouteMatch } from "@/server/proxy/types";

const baseSub = (overrides: Partial<AuthedRequest> = {}): AuthedRequest => ({
  subKeyId: "sk_x",
  subKeyShortId: "sk_x",
  workspaceId: "ws",
  verbs: [],
  scopeProjects: ["*"],
  scopeBoards: ["*"],
  boundWeeekUserId: "u-42",
  visibilityBound: false,
  authorRewrite: false,
  masterKey: "wk",
  ...overrides,
});

const matchWith = (
  flags: NonNullable<RouteMatch["entry"]["flags"]> = {},
  method: "GET" | "POST" | "PATCH" = "GET",
): RouteMatch =>
  ({
    entry: {
      method,
      pattern: /^/,
      resource: "tasks",
      verb: method === "GET" ? "tasks:read" : "tasks:write",
      extractParams: () => ({}),
      flags,
    },
    params: {},
  }) as RouteMatch;

describe("applyVisibilityFilter", () => {
  test("injects assigneeId when listEndpoint + visibilityBound + boundWeeekUserId", () => {
    const url = new URL("https://gw.test/ws/tasks?status=open");
    applyVisibilityFilter(url, matchWith({ listEndpoint: true }), baseSub({ visibilityBound: true }));
    expect(url.searchParams.get("assigneeId")).toBe("u-42");
    expect(url.searchParams.get("status")).toBe("open");
  });

  test("no-op when visibilityBound is false", () => {
    const url = new URL("https://gw.test/ws/tasks");
    applyVisibilityFilter(url, matchWith({ listEndpoint: true }), baseSub({ visibilityBound: false }));
    expect(url.searchParams.get("assigneeId")).toBeNull();
  });

  test("no-op when route is not flagged listEndpoint", () => {
    const url = new URL("https://gw.test/ws/tasks/abc");
    applyVisibilityFilter(url, matchWith({}), baseSub({ visibilityBound: true }));
    expect(url.searchParams.get("assigneeId")).toBeNull();
  });

  test("no-op when boundWeeekUserId is null", () => {
    const url = new URL("https://gw.test/ws/tasks");
    applyVisibilityFilter(
      url,
      matchWith({ listEndpoint: true }),
      baseSub({ visibilityBound: true, boundWeeekUserId: null }),
    );
    expect(url.searchParams.get("assigneeId")).toBeNull();
  });

  test("does not overwrite existing assigneeId in the request", () => {
    const url = new URL("https://gw.test/ws/tasks?assigneeId=u-99");
    applyVisibilityFilter(url, matchWith({ listEndpoint: true }), baseSub({ visibilityBound: true }));
    // Phase decision: caller-provided assigneeId is preserved (defence in depth would rewrite, but
    // we want the deny-by-policy story to be the one source of truth — the caller can't broaden by
    // changing this param because they only have access to their own bound user anyway).
    expect(url.searchParams.get("assigneeId")).toBe("u-99");
  });
});

describe("rewriteAuthor", () => {
  test("injects assigneeId when JSON body + authorRewrite + authorRewritable + field absent", async () => {
    const out = await rewriteAuthor(
      JSON.stringify({ title: "x" }),
      "application/json",
      matchWith({ authorRewritable: true }, "POST"),
      baseSub({ authorRewrite: true }),
    );
    expect(out.body).not.toBeNull();
    const parsed = JSON.parse(out.body as string);
    expect(parsed).toEqual({ title: "x", assigneeId: "u-42" });
  });

  test("does NOT overwrite existing assigneeId in the body", async () => {
    const out = await rewriteAuthor(
      JSON.stringify({ title: "x", assigneeId: "u-self-pick" }),
      "application/json",
      matchWith({ authorRewritable: true }, "POST"),
      baseSub({ authorRewrite: true }),
    );
    const parsed = JSON.parse(out.body as string);
    expect(parsed.assigneeId).toBe("u-self-pick");
  });

  test("no-op when authorRewrite is false", async () => {
    const original = JSON.stringify({ title: "x" });
    const out = await rewriteAuthor(
      original,
      "application/json",
      matchWith({ authorRewritable: true }, "POST"),
      baseSub({ authorRewrite: false }),
    );
    expect(out.body).toBe(original);
  });

  test("no-op when route is not authorRewritable", async () => {
    const original = JSON.stringify({ title: "x" });
    const out = await rewriteAuthor(
      original,
      "application/json",
      matchWith({}, "POST"),
      baseSub({ authorRewrite: true }),
    );
    expect(out.body).toBe(original);
  });

  test("no-op for non-JSON content type", async () => {
    const original = "title=x";
    const out = await rewriteAuthor(
      original,
      "application/x-www-form-urlencoded",
      matchWith({ authorRewritable: true }, "POST"),
      baseSub({ authorRewrite: true }),
    );
    expect(out.body).toBe(original);
  });

  test("no-op when boundWeeekUserId is null", async () => {
    const original = JSON.stringify({ title: "x" });
    const out = await rewriteAuthor(
      original,
      "application/json",
      matchWith({ authorRewritable: true }, "POST"),
      baseSub({ authorRewrite: true, boundWeeekUserId: null }),
    );
    expect(out.body).toBe(original);
  });

  test("no-op for null body (e.g., DELETE)", async () => {
    const out = await rewriteAuthor(
      null,
      "application/json",
      matchWith({ authorRewritable: true }, "POST"),
      baseSub({ authorRewrite: true }),
    );
    expect(out.body).toBeNull();
  });

  test("malformed JSON falls through unchanged", async () => {
    const malformed = "not json{";
    const out = await rewriteAuthor(
      malformed,
      "application/json",
      matchWith({ authorRewritable: true }, "POST"),
      baseSub({ authorRewrite: true }),
    );
    expect(out.body).toBe(malformed);
  });
});
```

- [ ] **Step 2: implement**

```ts
import type { AuthedRequest, RouteMatch } from "./types";

// TODO(verify): confirm against Weeek API docs. Single source of truth for both
// the visibility-filter query param and the author-rewrite body field. Spec §19
// flags both as open questions; phase-5c pins them to "assigneeId" as the most
// likely Weeek field given the validate path uses `/ws/members?limit=1` etc.
const ASSIGNEE_QUERY_PARAM = "assigneeId";
const ASSIGNEE_BODY_FIELD = "assigneeId";

export function applyVisibilityFilter(
  url: URL,
  match: RouteMatch,
  authed: AuthedRequest,
): void {
  if (!authed.visibilityBound) return;
  if (!authed.boundWeeekUserId) return;
  if (!match.entry.flags?.listEndpoint) return;
  if (url.searchParams.has(ASSIGNEE_QUERY_PARAM)) return; // caller-provided wins
  url.searchParams.set(ASSIGNEE_QUERY_PARAM, authed.boundWeeekUserId);
}

export type RewriteAuthorResult = {
  body: BodyInit | null;
};

export async function rewriteAuthor(
  body: string | null,
  contentType: string | null,
  match: RouteMatch,
  authed: AuthedRequest,
): Promise<RewriteAuthorResult> {
  if (!authed.authorRewrite) return { body };
  if (!authed.boundWeeekUserId) return { body };
  if (!match.entry.flags?.authorRewritable) return { body };
  if (body == null) return { body };
  if (!contentType || !contentType.toLowerCase().includes("application/json")) {
    return { body };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { body };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { body };
  }
  const obj = parsed as Record<string, unknown>;
  if (ASSIGNEE_BODY_FIELD in obj) return { body };
  obj[ASSIGNEE_BODY_FIELD] = authed.boundWeeekUserId;
  return { body: JSON.stringify(obj) };
}
```

- [ ] **Step 3: re-run, expect 13 PASS**

`pnpm vitest run tests/unit/proxy-rewrites.test.ts`

- [ ] **Step 4: lint+typecheck**

- [ ] **Step 5: Commit**

```bash
git add src/server/proxy/rewrites.ts tests/unit/proxy-rewrites.test.ts
git commit -m "phase-5c task 5: pure rewrite helpers (visibility filter + author rewrite)"
```

---

## Task 6: handler integrates rewrites

**Files:**
- Modify: `src/server/proxy/handler.ts`
- Modify: `tests/integration/proxy-handler.test.ts`

- [ ] **Step 1: extend handler tests** — append inside describe:

```ts
  // --- Phase 5c: visibility filter + author rewrite ---

  async function setupBound(opts: { visibilityBound: boolean; authorRewrite: boolean }) {
    const seeded = await setup("full-access");
    // Patch the sub-key with binding fields after creation (skips wizard).
    const { db } = await import("@/server/db/client");
    const { subKey } = await import("@/server/db/schema/subKey");
    const { eq } = await import("drizzle-orm");
    await db
      .update(subKey)
      .set({
        boundWeeekUserId: "u-bound",
        boundWeeekUserName: "BoundUser",
        visibilityBound: opts.visibilityBound,
        authorRewrite: opts.authorRewrite,
      })
      .where(eq(subKey.id, seeded.subKeyId));
    return seeded;
  }

  test("GET /ws/tasks injects assigneeId when visibilityBound", async () => {
    const seeded = await setupBound({ visibilityBound: true, authorRewrite: false });
    let observedQuery: string | null = null;
    server.use(
      http.get(`${WEEEK_BASE}/ws/tasks`, ({ request }) => {
        observedQuery = new URL(request.url).search;
        return HttpResponse.json({ tasks: [] });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    const res = await proxy(
      new Request("https://gw.test/api/v1/ws/tasks", { method: "GET", headers }),
    );
    expect(res.status).toBe(200);
    expect(observedQuery).toContain("assigneeId=u-bound");
  });

  test("GET /ws/tasks/abc does NOT inject assigneeId (single resource, not list)", async () => {
    const seeded = await setupBound({ visibilityBound: true, authorRewrite: false });
    let observedQuery: string | null = null;
    server.use(
      http.get(`${WEEEK_BASE}/ws/tasks/abc`, ({ request }) => {
        observedQuery = new URL(request.url).search;
        return HttpResponse.json({ id: "abc" });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    const res = await proxy(
      new Request("https://gw.test/api/v1/ws/tasks/abc", { method: "GET", headers }),
    );
    expect(res.status).toBe(200);
    expect(observedQuery).toBe("");
  });

  test("GET /ws/projects does NOT inject assigneeId (resource not in spec list)", async () => {
    const seeded = await setupBound({ visibilityBound: true, authorRewrite: false });
    let observedQuery: string | null = null;
    server.use(
      http.get(`${WEEEK_BASE}/ws/projects`, ({ request }) => {
        observedQuery = new URL(request.url).search;
        return HttpResponse.json({ projects: [] });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    const res = await proxy(
      new Request("https://gw.test/api/v1/ws/projects", { method: "GET", headers }),
    );
    expect(res.status).toBe(200);
    expect(observedQuery).toBe("");
  });

  test("POST /ws/tasks injects assigneeId in body when authorRewrite", async () => {
    const seeded = await setupBound({ visibilityBound: false, authorRewrite: true });
    let observedBody: unknown;
    server.use(
      http.post(`${WEEEK_BASE}/ws/tasks`, async ({ request }) => {
        observedBody = await request.json();
        return HttpResponse.json({ id: "task_new" });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    headers.set("content-type", "application/json");
    const res = await proxy(
      new Request("https://gw.test/api/v1/ws/tasks", {
        method: "POST",
        headers,
        body: JSON.stringify({ title: "hello" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(observedBody).toEqual({ title: "hello", assigneeId: "u-bound" });
  });

  test("POST /ws/tasks does NOT overwrite caller-provided assigneeId", async () => {
    const seeded = await setupBound({ visibilityBound: false, authorRewrite: true });
    let observedBody: unknown;
    server.use(
      http.post(`${WEEEK_BASE}/ws/tasks`, async ({ request }) => {
        observedBody = await request.json();
        return HttpResponse.json({ id: "x" });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    headers.set("content-type", "application/json");
    const res = await proxy(
      new Request("https://gw.test/api/v1/ws/tasks", {
        method: "POST",
        headers,
        body: JSON.stringify({ title: "x", assigneeId: "u-self" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(observedBody).toEqual({ title: "x", assigneeId: "u-self" });
  });

  test("flags off: no rewrite happens", async () => {
    const seeded = await setupBound({ visibilityBound: false, authorRewrite: false });
    let observedQuery: string | null = null;
    let observedBody: unknown;
    server.use(
      http.get(`${WEEEK_BASE}/ws/tasks`, ({ request }) => {
        observedQuery = new URL(request.url).search;
        return HttpResponse.json({ tasks: [] });
      }),
      http.post(`${WEEEK_BASE}/ws/tasks`, async ({ request }) => {
        observedBody = await request.json();
        return HttpResponse.json({ id: "x" });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    headers.set("content-type", "application/json");
    await proxy(new Request("https://gw.test/api/v1/ws/tasks", { method: "GET", headers }));
    expect(observedQuery).toBe("");

    await proxy(
      new Request("https://gw.test/api/v1/ws/tasks", {
        method: "POST",
        headers,
        body: JSON.stringify({ title: "x" }),
      }),
    );
    expect(observedBody).toEqual({ title: "x" });
  });
```

- [ ] **Step 2: integrate in handler.ts** — replace the section between policy and forward:

```ts
  // 3. Policy
  const decision = evaluate(match, authed);
  if (!decision.allowed) {
    log.info(
      { ourStatus: 403, denyReason: decision.code, subKeyId: authed.subKeyShortId },
      "proxy denied",
    );
    return errorResponse({
      code: decision.code,
      status: STATUS_FOR_DENY[decision.code],
      message: decision.message,
      subKeyId: authed.subKeyShortId,
      requestId,
    });
  }

  // 4. Rewrites
  // 4a. Visibility filter — mutate the URL query in place.
  applyVisibilityFilter(url, match, authed);

  // 4b. Author rewrite — read body if author-rewritable + JSON; otherwise pass through.
  let outboundBody: BodyInit | null = req.body;
  if (
    match.entry.flags?.authorRewritable &&
    authed.authorRewrite &&
    authed.boundWeeekUserId
  ) {
    const text = await req.text(); // consumes the stream; OK since writes don't retry
    const rewritten = await rewriteAuthor(
      text || null,
      req.headers.get("content-type"),
      match,
      authed,
    );
    outboundBody = rewritten.body;
  }

  // 5. Forward
  const upstream = await forward({
    masterKey: authed.masterKey,
    pathname: proxiedPath,
    search: url.search, // url may have been mutated by applyVisibilityFilter
    method,
    headers: req.headers,
    body: outboundBody,
    requestId,
    subKeyId: authed.subKeyShortId,
  });
```

Add the imports at the top of `handler.ts`:

```ts
import { applyVisibilityFilter, rewriteAuthor } from "./rewrites";
```

Renumber the audit step from comment "5." to "6." for clarity.

**Important:** when consuming `req.text()`, the request body stream is consumed. The handler now ALWAYS goes through the text branch when those flags + flag-on-route are set. Otherwise we keep the streaming `req.body` to preserve phase-4/5a behaviour for everything else.

- [ ] **Step 3: run handler tests + full suite**

`pnpm vitest run tests/integration/proxy-handler.test.ts` — 17 (existing) + 6 (new) = 23.
`pnpm test` — full suite green.

- [ ] **Step 4: lint+typecheck**

- [ ] **Step 5: Commit**

```bash
git add src/server/proxy/handler.ts tests/integration/proxy-handler.test.ts
git commit -m "phase-5c task 6: handler applies visibility filter + author rewrite when flagged"
```

---

## Task 7: wizard Identity step

**Files:**
- Create: `src/components/feature/identity-step.tsx`
- Modify: `src/components/feature/issue-sub-key-dialog.tsx`

- [ ] **Step 1: create identity-step.tsx**

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc-client";

export type IdentityState = {
  label: string;
  boundWeeekUserId: string | null;
  boundWeeekUserName: string | null;
  visibilityBound: boolean;
  authorRewrite: boolean;
};

type Props = {
  workspaceId: string;
  state: IdentityState;
  onChange: (next: IdentityState) => void;
};

export function IdentityStep({ workspaceId, state, onChange }: Props) {
  const membersQ = trpc.weeekDirectory.members.useQuery({ workspaceId });
  const members = membersQ.data ?? [];

  function setMember(id: string) {
    if (id === "") {
      onChange({
        ...state,
        boundWeeekUserId: null,
        boundWeeekUserName: null,
        visibilityBound: false,
        authorRewrite: false,
      });
      return;
    }
    const m = members.find((x) => String(x.id) === id);
    onChange({
      ...state,
      boundWeeekUserId: id,
      boundWeeekUserName: m?.name ?? null,
    });
  }

  const memberPicked = state.boundWeeekUserId !== null;

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="sk-label">Label</Label>
        <Input
          id="sk-label"
          value={state.label}
          onChange={(e) => onChange({ ...state, label: e.target.value })}
          placeholder="CI bot"
          autoComplete="off"
          maxLength={80}
          required
        />
        <p className="text-muted-foreground text-xs">
          Shown in the dashboard and in audit log; not embedded in the key itself.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="sk-member">Bound Weeek user (optional)</Label>
        <select
          id="sk-member"
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          value={state.boundWeeekUserId ?? ""}
          onChange={(e) => setMember(e.target.value)}
          disabled={membersQ.isLoading}
        >
          <option value="">— None —</option>
          {members.map((m) => (
            <option key={String(m.id)} value={String(m.id)}>
              {m.name}
            </option>
          ))}
        </select>
        {membersQ.error ? (
          <p className="text-destructive text-xs">{membersQ.error.message}</p>
        ) : null}
      </div>

      <label
        className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 ${
          memberPicked ? "" : "opacity-50"
        }`}
      >
        <input
          type="checkbox"
          className="mt-0.5"
          checked={state.visibilityBound}
          disabled={!memberPicked}
          onChange={(e) => onChange({ ...state, visibilityBound: e.target.checked })}
        />
        <span className="text-sm">
          <span className="font-medium">Filter visibility to this user.</span>{" "}
          <span className="text-muted-foreground">
            On list endpoints (tasks, comments, time entries) the proxy injects an
            <code className="px-1">assigneeId</code> filter so this sub-key only sees the bound
            user&apos;s items.
          </span>
        </span>
      </label>

      <label
        className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 ${
          memberPicked ? "" : "opacity-50"
        }`}
      >
        <input
          type="checkbox"
          className="mt-0.5"
          checked={state.authorRewrite}
          disabled={!memberPicked}
          onChange={(e) => onChange({ ...state, authorRewrite: e.target.checked })}
        />
        <span className="text-sm">
          <span className="font-medium">Use as default author.</span>{" "}
          <span className="text-muted-foreground">
            On task and comment writes, if the request body omits the author field, the proxy
            inserts the bound user&apos;s id.
          </span>
        </span>
      </label>
    </div>
  );
}
```

- [ ] **Step 2: rework `issue-sub-key-dialog.tsx`**

Replace the file's existing label-only step-1 block with the IdentityStep component, lift state into a single `IdentityState`, and pass binding fields into the create mutation. The Scope step (step 2), Verbs step (step 3), Review step (step 4) remain unchanged. Updated state declaration:

```tsx
const [identity, setIdentity] = useState<IdentityState>({
  label: "",
  boundWeeekUserId: null,
  boundWeeekUserName: null,
  visibilityBound: false,
  authorRewrite: false,
});
```

`reset()` resets identity to that initial value.

`previewPolicy()` includes the binding fields:

```tsx
function previewPolicy() {
  return JSON.stringify(
    {
      label: identity.label,
      preset,
      bound_weeek_user_id: identity.boundWeeekUserId,
      bound_weeek_user_name: identity.boundWeeekUserName,
      visibility_bound: identity.visibilityBound,
      author_rewrite: identity.authorRewrite,
      scope_projects: [...scopeProjects],
      scope_boards: [...scopeBoards],
      verbs: [...expandPreset(preset)],
    },
    null,
    2,
  );
}
```

Step-1 block becomes:

```tsx
{step === 1 ? (
  <IdentityStep
    workspaceId={workspaceId}
    state={identity}
    onChange={setIdentity}
  />
) : null}
```

The Next button at step 1 disables when `identity.label.trim().length === 0`.

The create mutation invocation:

```tsx
createMutation.mutate({
  workspaceId,
  label: identity.label.trim(),
  preset,
  scopeProjects: [...scopeProjects],
  scopeBoards: [...scopeBoards],
  boundWeeekUserId: identity.boundWeeekUserId,
  boundWeeekUserName: identity.boundWeeekUserName,
  visibilityBound: identity.visibilityBound,
  authorRewrite: identity.authorRewrite,
})
```

Drop the standalone `label` and individual setters; the IdentityStep manages them.

- [ ] **Step 3: lint+typecheck**

- [ ] **Step 4: full suite still green**

`pnpm test`

- [ ] **Step 5: Commit**

```bash
git add src/components/feature/identity-step.tsx src/components/feature/issue-sub-key-dialog.tsx
git commit -m "phase-5c task 7: wizard Identity step (member picker + binding toggles)"
```

---

## Task 8: plan + ff-merge

```bash
git add docs/superpowers/plans/2026-05-07-phase-5c-binding.md
git commit -m "docs: phase 5c plan"
```

Then exit worktree, ff-merge, cleanup as in 5a/5b.

---

## Self-Review Checklist

- **Spec coverage:** §7.3 step 3 (visibility filter on list endpoints) → tasks 4 + 5 + 6. §7.3 step 4 (author rewrite when field absent) → tasks 4 + 5 + 6. §11 wizard step 1 identity (label + bound user combobox + 2 toggles) → task 7. §9 `weeekDirectory.members` → task 2.
- **Placeholders:** `assigneeId` constants flagged with `TODO(verify)` per the explicit spec §19 open questions.
- **Type consistency:** `AuthedRequest` extension in task 0 plumbed through task 1 → consumed in tasks 5 + 6. `RouteEntry.flags` shape stable across tasks 0 + 4 + 5.
- **Backwards compat:** `subKey.create` defaults binding fields to null/false; phase-4/5a/5b tests untouched. Existing handler tests untouched (rewrites are no-ops when flags are off).
- **No streaming hazard for writes:** consuming `req.text()` only happens when `authorRewritable + authorRewrite` are both true. Reads keep their streamed body.

---

**Plan complete.** Execution: inline (subagent-rate-limit fallback from 5a/5b applies).
