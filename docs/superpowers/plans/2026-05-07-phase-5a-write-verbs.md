# Phase 5a — Write/Delete Verbs in the Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the proxy route table and end-to-end matrix to cover write/delete verbs (`POST`, `PATCH`, `DELETE` on the resources phase 4 already exposes for read). The streaming-body retry decision was locked in phase 4 (`forward.ts` line 56: retry only when body is null) — write verbs ride on that, no retries.

**Architecture:**
- Widen `RouteEntry.method` from the `"GET"` literal to a union `"GET" | "POST" | "PATCH" | "DELETE"`. The route table grows new entries; everything else (`policyEval`, `auth`, `forward`, `handler`, catch-all route) is already verb-agnostic and needs no behavioural change.
- Body forwarding already works (`req.body` → `forward({ body: req.body })` with `duplex: "half"`). We add an E2E test that confirms a POST body lands at the upstream unchanged.
- Endpoint paths are best-effort REST conventions. Where Weeek's exact path/method differs we document the assumption in `routeTable.ts` and add a backlog item to verify against Weeek's live API docs once they're consulted.

**Tech Stack:** existing — TypeScript, Drizzle, vitest, msw. No new dependencies.

**Deferred to phase 5b/5c:**
- 5b: scope tightening (`weeekDirectory` tRPC, wizard project/board pickers, real `scope_projects`/`scope_boards`).
- 5c: payload rewrites (assignee filter injection on list endpoints, `authorRewrite` on POST/PATCH bodies, `visibilityBound` body inspection).

---

## Endpoint Assumption Table

| Verb | Method | Path | Notes |
|------|--------|------|-------|
| `projects:write` | POST | `/ws/projects` | create |
| `projects:write` | PATCH | `/ws/projects/{id}` | update |
| `projects:delete` | DELETE | `/ws/projects/{id}` | |
| `boards:write` | POST | `/ws/boards` | create (body carries `projectId`) |
| `boards:write` | PATCH | `/ws/boards/{id}` | update |
| `boards:delete` | DELETE | `/ws/boards/{id}` | |
| `tasks:write` | POST | `/ws/tasks` | create (body carries `boardId`/`projectId`) |
| `tasks:write` | PATCH | `/ws/tasks/{id}` | update |
| `tasks:delete` | DELETE | `/ws/tasks/{id}` | |
| `tasks:complete` | POST | `/ws/tasks/{id}/complete` | dedicated endpoint per spec verb split |
| `tasks:move` | POST | `/ws/tasks/{id}/move` | dedicated endpoint per spec verb split |
| `comments:write` | POST | `/ws/tasks/{id}/comments` | create comment on task |
| `comments:write` | PATCH | `/ws/tasks/{taskId}/comments/{commentId}` | update |
| `comments:delete` | DELETE | `/ws/tasks/{taskId}/comments/{commentId}` | |
| `custom_fields:write` | POST | `/ws/custom-fields` | create |
| `custom_fields:write` | PATCH | `/ws/custom-fields/{id}` | update |
| `time_entries:write` | POST | `/ws/time-entries` | create |
| `time_entries:write` | PATCH | `/ws/time-entries/{id}` | update |
| `time_entries:delete` | DELETE | `/ws/time-entries/{id}` | |

**Assumption flag:** the table reflects standard REST conventions. If Weeek diverges (e.g. `PUT` instead of `PATCH`, or `tasks:complete` is `PATCH /ws/tasks/{id}` with `{status: "completed"}` rather than a dedicated endpoint), update both `routeTable.ts` and the snapshot test in a follow-up commit. Mark unresolved entries with `// TODO(verify): confirm vs Weeek API docs` in the route table.

---

## File Structure

| Path | Change |
|------|--------|
| `src/server/proxy/types.ts` | Widen `RouteEntry.method` to method union |
| `src/server/proxy/routeTable.ts` | Add 19 new entries for write/delete verbs |
| `tests/unit/proxy-route-table.test.ts` | Extend with method-specific match tests + updated snapshot |
| `tests/integration/proxy-handler.test.ts` | Extend with write-verb scenarios (auth gate, verb gate, body forwarding, no-retry) |

No new files in `src/server/proxy/` — the existing modules already handle every method.

---

## Task 0: Widen `RouteEntry.method` to method union

**Why:** Required before the route table can hold non-GET entries. Pure type change, no behaviour shift.

**Files:**
- Modify: `src/server/proxy/types.ts:17-24`

- [ ] **Step 1: Update the `method` field type**

In `src/server/proxy/types.ts`, change line 18 from:

```ts
  method: "GET";
```

to:

```ts
  method: "GET" | "POST" | "PATCH" | "DELETE";
```

- [ ] **Step 2: Run lint + typecheck to confirm no callsite breaks**

Run: `pnpm lint && pnpm typecheck`
Expected: clean. (`matchRoute` compares `entry.method !== method` against a `string`; widening the literal type only relaxes the union, no narrowing breakage.)

- [ ] **Step 3: Run existing tests to confirm no regressions**

Run: `pnpm vitest run tests/unit/proxy-route-table.test.ts tests/unit/proxy-policy-eval.test.ts`
Expected: 14 + 6 = 20 tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/server/proxy/types.ts
git commit -m "phase-5a task 0: widen RouteEntry.method to GET|POST|PATCH|DELETE union"
```

---

## Task 1: Extend `routeTable.ts` with write/delete entries

**Why:** Enable the proxy to recognise write paths so they reach `policyEval` instead of being denied with `unknown_route`.

**Files:**
- Modify: `src/server/proxy/routeTable.ts:17-95`
- Modify: `tests/unit/proxy-route-table.test.ts`
- Update: `tests/unit/__snapshots__/proxy-route-table.test.ts.snap`

- [ ] **Step 1: Write the failing tests for the new entries**

Append to `tests/unit/proxy-route-table.test.ts` inside the existing `describe("matchRoute", ...)` block:

```ts
  // --- Write verbs (phase 5a) ---

  test("POST /ws/projects → projects:write", () => {
    const m = matchRoute("POST", "/ws/projects", new URLSearchParams());
    expect(m?.entry.verb).toBe("projects:write");
    expect(m?.entry.method).toBe("POST");
  });

  test("PATCH /ws/projects/42 → projects:write with projectId=42", () => {
    const m = matchRoute("PATCH", "/ws/projects/42", new URLSearchParams());
    expect(m?.entry.verb).toBe("projects:write");
    expect(m?.params.projectId).toBe("42");
  });

  test("DELETE /ws/projects/42 → projects:delete", () => {
    const m = matchRoute("DELETE", "/ws/projects/42", new URLSearchParams());
    expect(m?.entry.verb).toBe("projects:delete");
    expect(m?.params.projectId).toBe("42");
  });

  test("POST /ws/boards → boards:write", () => {
    const m = matchRoute("POST", "/ws/boards", new URLSearchParams());
    expect(m?.entry.verb).toBe("boards:write");
  });

  test("PATCH /ws/boards/9 → boards:write", () => {
    const m = matchRoute("PATCH", "/ws/boards/9", new URLSearchParams());
    expect(m?.entry.verb).toBe("boards:write");
    expect(m?.params.boardId).toBe("9");
  });

  test("DELETE /ws/boards/9 → boards:delete", () => {
    const m = matchRoute("DELETE", "/ws/boards/9", new URLSearchParams());
    expect(m?.entry.verb).toBe("boards:delete");
  });

  test("POST /ws/tasks → tasks:write", () => {
    const m = matchRoute("POST", "/ws/tasks", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:write");
  });

  test("PATCH /ws/tasks/abc → tasks:write", () => {
    const m = matchRoute("PATCH", "/ws/tasks/abc", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:write");
  });

  test("DELETE /ws/tasks/abc → tasks:delete", () => {
    const m = matchRoute("DELETE", "/ws/tasks/abc", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:delete");
  });

  test("POST /ws/tasks/abc/complete → tasks:complete", () => {
    const m = matchRoute("POST", "/ws/tasks/abc/complete", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:complete");
  });

  test("POST /ws/tasks/abc/move → tasks:move", () => {
    const m = matchRoute("POST", "/ws/tasks/abc/move", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:move");
  });

  test("POST /ws/tasks/abc/comments → comments:write", () => {
    const m = matchRoute("POST", "/ws/tasks/abc/comments", new URLSearchParams());
    expect(m?.entry.verb).toBe("comments:write");
  });

  test("PATCH /ws/tasks/abc/comments/c1 → comments:write", () => {
    const m = matchRoute("PATCH", "/ws/tasks/abc/comments/c1", new URLSearchParams());
    expect(m?.entry.verb).toBe("comments:write");
  });

  test("DELETE /ws/tasks/abc/comments/c1 → comments:delete", () => {
    const m = matchRoute("DELETE", "/ws/tasks/abc/comments/c1", new URLSearchParams());
    expect(m?.entry.verb).toBe("comments:delete");
  });

  test("POST /ws/custom-fields → custom_fields:write", () => {
    const m = matchRoute("POST", "/ws/custom-fields", new URLSearchParams());
    expect(m?.entry.verb).toBe("custom_fields:write");
  });

  test("PATCH /ws/custom-fields/cf1 → custom_fields:write", () => {
    const m = matchRoute("PATCH", "/ws/custom-fields/cf1", new URLSearchParams());
    expect(m?.entry.verb).toBe("custom_fields:write");
  });

  test("POST /ws/time-entries → time_entries:write", () => {
    const m = matchRoute("POST", "/ws/time-entries", new URLSearchParams());
    expect(m?.entry.verb).toBe("time_entries:write");
  });

  test("PATCH /ws/time-entries/te1 → time_entries:write", () => {
    const m = matchRoute("PATCH", "/ws/time-entries/te1", new URLSearchParams());
    expect(m?.entry.verb).toBe("time_entries:write");
  });

  test("DELETE /ws/time-entries/te1 → time_entries:delete", () => {
    const m = matchRoute("DELETE", "/ws/time-entries/te1", new URLSearchParams());
    expect(m?.entry.verb).toBe("time_entries:delete");
  });

  test("POST /ws/members → null (members are read-only per verb catalogue)", () => {
    const m = matchRoute("POST", "/ws/members", new URLSearchParams());
    expect(m).toBeNull();
  });

  test("DELETE /ws/custom-fields/cf1 → null (no custom_fields:delete verb)", () => {
    const m = matchRoute("DELETE", "/ws/custom-fields/cf1", new URLSearchParams());
    expect(m).toBeNull();
  });
```

- [ ] **Step 2: Run, expect FAIL on the new tests**

Run: `pnpm vitest run tests/unit/proxy-route-table.test.ts`
Expected: existing 14 still pass; 21 new tests fail with `m === null` for the write/delete paths.

- [ ] **Step 3: Implement — append to `ROUTE_TABLE` in `src/server/proxy/routeTable.ts`**

Insert the new entries before the closing `];` of the `ROUTE_TABLE` array. Keep the existing GET entries unchanged.

```ts
  // --- Phase 5a write/delete entries ---
  // TODO(verify): confirm exact paths/methods against Weeek's live API docs.
  // Defaults below assume standard REST conventions.

  // Projects
  {
    method: "POST",
    pattern: new RegExp(`^/ws/projects$`),
    resource: "projects",
    verb: "projects:write",
    extractParams: empty,
  },
  {
    method: "PATCH",
    pattern: new RegExp(`^/ws/projects/${ID}$`),
    resource: "projects",
    verb: "projects:write",
    extractParams: (m) => ({ projectId: m[1] ?? "" }),
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^/ws/projects/${ID}$`),
    resource: "projects",
    verb: "projects:delete",
    extractParams: (m) => ({ projectId: m[1] ?? "" }),
  },

  // Boards
  {
    method: "POST",
    pattern: new RegExp(`^/ws/boards$`),
    resource: "boards",
    verb: "boards:write",
    extractParams: fromQuery(["projectId"]),
  },
  {
    method: "PATCH",
    pattern: new RegExp(`^/ws/boards/${ID}$`),
    resource: "boards",
    verb: "boards:write",
    extractParams: (m) => ({ boardId: m[1] ?? "" }),
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^/ws/boards/${ID}$`),
    resource: "boards",
    verb: "boards:delete",
    extractParams: (m) => ({ boardId: m[1] ?? "" }),
  },

  // Tasks
  {
    method: "POST",
    pattern: new RegExp(`^/ws/tasks$`),
    resource: "tasks",
    verb: "tasks:write",
    extractParams: fromQuery(["projectId", "boardId"]),
  },
  {
    method: "PATCH",
    pattern: new RegExp(`^/ws/tasks/${ID}$`),
    resource: "tasks",
    verb: "tasks:write",
    extractParams: () => ({}),
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^/ws/tasks/${ID}$`),
    resource: "tasks",
    verb: "tasks:delete",
    extractParams: () => ({}),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/ws/tasks/${ID}/complete$`),
    resource: "tasks",
    verb: "tasks:complete",
    extractParams: () => ({}),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/ws/tasks/${ID}/move$`),
    resource: "tasks",
    verb: "tasks:move",
    extractParams: () => ({}),
  },

  // Comments
  {
    method: "POST",
    pattern: new RegExp(`^/ws/tasks/${ID}/comments$`),
    resource: "comments",
    verb: "comments:write",
    extractParams: () => ({}),
  },
  {
    method: "PATCH",
    pattern: new RegExp(`^/ws/tasks/${ID}/comments/${ID}$`),
    resource: "comments",
    verb: "comments:write",
    extractParams: () => ({}),
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^/ws/tasks/${ID}/comments/${ID}$`),
    resource: "comments",
    verb: "comments:delete",
    extractParams: () => ({}),
  },

  // Custom fields
  {
    method: "POST",
    pattern: new RegExp(`^/ws/custom-fields$`),
    resource: "custom_fields",
    verb: "custom_fields:write",
    extractParams: empty,
  },
  {
    method: "PATCH",
    pattern: new RegExp(`^/ws/custom-fields/${ID}$`),
    resource: "custom_fields",
    verb: "custom_fields:write",
    extractParams: empty,
  },

  // Time entries
  {
    method: "POST",
    pattern: new RegExp(`^/ws/time-entries$`),
    resource: "time_entries",
    verb: "time_entries:write",
    extractParams: fromQuery(["projectId"]),
  },
  {
    method: "PATCH",
    pattern: new RegExp(`^/ws/time-entries/${ID}$`),
    resource: "time_entries",
    verb: "time_entries:write",
    extractParams: empty,
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^/ws/time-entries/${ID}$`),
    resource: "time_entries",
    verb: "time_entries:delete",
    extractParams: empty,
  },
```

- [ ] **Step 4: Re-run tests with snapshot update, then verify**

```
pnpm vitest run tests/unit/proxy-route-table.test.ts -u
pnpm vitest run tests/unit/proxy-route-table.test.ts
```
Expected: 35 tests pass (14 existing + 21 new), snapshot updated and stable.

- [ ] **Step 5: Run full unit + handler test suite to confirm no regressions in policy/handler/etc**

Run: `pnpm test`
Expected: all green. Phase 4 baseline 107 + 21 new = 128 tests (handler matrix coverage in task 2 will add more — they don't run yet at this checkpoint).

- [ ] **Step 6: Lint + typecheck clean**

Run: `pnpm lint && pnpm typecheck`

- [ ] **Step 7: Commit**

```bash
git add src/server/proxy/routeTable.ts tests/unit/proxy-route-table.test.ts tests/unit/__snapshots__/proxy-route-table.test.ts.snap
git commit -m "phase-5a task 1: route-table entries for write/delete verbs"
```

---

## Task 2: E2E handler tests for write verbs

**Why:** The handler/policy/forward modules are already verb-agnostic, but no test exercises them through a non-GET path. We need E2E coverage that confirms (a) write requests reach Weeek with the master key swapped in, (b) the request body is forwarded byte-for-byte, (c) `verb_missing` denies a `read-only` sub-key writing to `/ws/tasks`, (d) the `tasks:complete` and `tasks:move` paths land on the right verb, (e) write paths do **not** retry on upstream 5xx.

**Files:**
- Modify: `tests/integration/proxy-handler.test.ts`

- [ ] **Step 1: Write failing tests**

Append the following inside the existing `describe("proxy handler matrix", ...)` block in `tests/integration/proxy-handler.test.ts`:

```ts
  // --- Phase 5a: write/delete verbs ---

  test("POST /ws/tasks succeeds for task-automator preset and forwards the body", async () => {
    const seeded = await setup("task-automator");
    let receivedBody: unknown;
    let observedAuth = "";
    server.use(
      http.post(`${WEEEK_BASE}/ws/tasks`, async ({ request }) => {
        observedAuth = request.headers.get("authorization") ?? "";
        receivedBody = await request.json();
        return HttpResponse.json({ id: "task_new" }, { status: 201 });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    headers.set("content-type", "application/json");
    const req = new Request("https://gw.test/api/v1/ws/tasks", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "hello", boardId: "b1" }),
    });
    const res = await proxy(req);
    expect(res.status).toBe(201);
    expect(observedAuth).toBe(`Bearer wk_master_${seeded.uid}_aaaaaaaaaaaaaaaa`);
    expect(receivedBody).toEqual({ title: "hello", boardId: "b1" });
  });

  test("POST /ws/tasks denied with verb_missing for read-only preset", async () => {
    const seeded = await setup("read-only");
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    headers.set("content-type", "application/json");
    const req = new Request("https://gw.test/api/v1/ws/tasks", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "x" }),
    });
    const res = await proxy(req);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("verb_missing");
  });

  test("DELETE /ws/tasks/123 denied for task-automator (no tasks:delete)", async () => {
    const seeded = await setup("task-automator");
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    const req = new Request("https://gw.test/api/v1/ws/tasks/123", {
      method: "DELETE",
      headers,
    });
    const res = await proxy(req);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("verb_missing");
  });

  test("DELETE /ws/tasks/123 succeeds for full-access preset", async () => {
    const seeded = await setup("full-access");
    server.use(
      http.delete(`${WEEEK_BASE}/ws/tasks/123`, () =>
        HttpResponse.json({ ok: true }, { status: 200 }),
      ),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    const req = new Request("https://gw.test/api/v1/ws/tasks/123", {
      method: "DELETE",
      headers,
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);
  });

  test("POST /ws/tasks/123/complete uses tasks:complete verb (granted by task-automator)", async () => {
    const seeded = await setup("task-automator");
    let hit = false;
    server.use(
      http.post(`${WEEEK_BASE}/ws/tasks/123/complete`, () => {
        hit = true;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    const req = new Request("https://gw.test/api/v1/ws/tasks/123/complete", {
      method: "POST",
      headers,
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(hit).toBe(true);
  });

  test("POST /ws/tasks/123/move uses tasks:move verb (granted by task-automator)", async () => {
    const seeded = await setup("task-automator");
    let hit = false;
    server.use(
      http.post(`${WEEEK_BASE}/ws/tasks/123/move`, () => {
        hit = true;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    const req = new Request("https://gw.test/api/v1/ws/tasks/123/move", {
      method: "POST",
      headers,
      body: JSON.stringify({ boardId: "b2" }),
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(hit).toBe(true);
  });

  test("POST upstream 5xx is NOT retried (body is non-null)", async () => {
    const seeded = await setup("full-access");
    let calls = 0;
    server.use(
      http.post(`${WEEEK_BASE}/ws/tasks`, () => {
        calls += 1;
        return HttpResponse.json({ err: "boom" }, { status: 503 });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    headers.set("content-type", "application/json");
    const req = new Request("https://gw.test/api/v1/ws/tasks", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "x" }),
    });
    const res = await proxy(req);
    expect(res.status).toBe(503);
    expect(calls).toBe(1); // critical: NO retry on write
  });

  test("PATCH /ws/tasks/abc forwards PATCH method and body", async () => {
    const seeded = await setup("full-access");
    let observedMethod = "";
    let observedBody: unknown;
    server.use(
      http.patch(`${WEEEK_BASE}/ws/tasks/abc`, async ({ request }) => {
        observedMethod = request.method;
        observedBody = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    headers.set("content-type", "application/json");
    const req = new Request("https://gw.test/api/v1/ws/tasks/abc", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ title: "renamed" }),
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(observedMethod).toBe("PATCH");
    expect(observedBody).toEqual({ title: "renamed" });
  });
```

- [ ] **Step 2: Run, expect FAIL on the new tests** (write paths currently return 403 `unknown_route` because task 1 already shipped — verify they now return 200/201/403 verb_missing as appropriate).

Run: `pnpm vitest run tests/integration/proxy-handler.test.ts`
Expected: existing 9 still pass + 8 new — 17 total. If a new test fails, fix the underlying code path (most likely a missed entry in task 1 or a wrong preset assumption).

**Preset reminder** (from `src/server/verbs.ts`):
- `read-only`: only `:read` verbs.
- `task-automator`: read on everything + `tasks:write`, `tasks:complete`, `tasks:move`, `comments:write`, `time_entries:write`. **Does not include** `tasks:delete`, `comments:delete`, `projects:write`, `boards:write`, `custom_fields:write`, `time_entries:delete`.
- `full-access`: every verb in the catalogue.

If a test asserts a verb the preset doesn't actually grant, fix the test rather than the preset.

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: all green. Total now 107 baseline + 21 (task 1) + 8 (task 2) = 136 tests.

- [ ] **Step 4: Lint + typecheck clean**

Run: `pnpm lint && pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add tests/integration/proxy-handler.test.ts
git commit -m "phase-5a task 2: handler E2E matrix for write/delete verbs"
```

---

## Task 3: Plan doc commit

**Files:**
- Modify: `docs/superpowers/plans/2026-05-07-phase-5a-write-verbs.md` (this file)

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/plans/2026-05-07-phase-5a-write-verbs.md
git commit -m "docs: phase 5a plan"
```

---

## Self-Review Checklist

- **Spec coverage:** §18 item 5 split into 5a (this plan: write/delete verbs only). 5b (scope tightening) and 5c (payload rewrites) are tracked in memory backlog and will get their own plans. §7.1 verb catalogue mapped: 11 write verbs from the 20-verb catalogue covered (the read 7 are already in phase 4; `members:read` and `*` reads stay; `members` has no write per spec; `custom_fields` has no `:delete` per spec). §13 error envelope/codes unchanged.
- **Placeholder scan:** none. Endpoint paths are explicit with the `TODO(verify)` flag inside the route table itself, not in the plan steps.
- **Type consistency:** `RouteEntry.method` widened in task 0 → consumed by new entries in task 1. Existing `RouteMatch`, `AuthedRequest`, `ProxyDecision` unchanged.
- **No retry on writes:** confirmed via `forward.ts:56` (`maxAttempts = input.body == null ? 2 : 1`). Task 2 includes an explicit "writes don't retry" assertion.

---

**Plan complete.** Execution: subagent-driven per the established phase workflow. After task 3, exit worktree and ff-merge as in phase 4.
