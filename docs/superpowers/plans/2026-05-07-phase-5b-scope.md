# Phase 5b — Scope Tightening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hard-coded `scope_projects: ["*"], scope_boards: ["*"]` stub with real, user-selected project/board scope. Adds a `weeekDirectory` tRPC router so the wizard can show live projects/boards from Weeek, and extends the wizard with a Scope step (4 steps total now). Policy evaluator enforces it.

**Architecture:**
- New tRPC router `weeekDirectory.projects/boards` calls Weeek with the workspace's decrypted master key, served behind a per-process in-memory `Map` cache with a 60s TTL. Survives a request burst from the wizard render without thrashing Weeek.
- `subKey.create` accepts `scopeProjects` + `scopeBoards` from the client. Wizard either sends `["*"]` (wildcard) or a non-empty array of ids. Empty arrays are rejected (Zod `.min(1)`). Scope is locked at issuance — no `subKey.update` in this phase (deferred per session decision).
- Wizard step order becomes `Identity → Scope → Verbs → Review` (was 3 steps, now 4). Scope step uses two checkbox lists (projects, boards) with a "Filter…" input each. Boards picker only enables once at least one project is picked OR projects are wildcard.
- Policy evaluator already enforces scope correctly (verified in phase-4 unit tests with `scopeProjects: ['1','2']`); only data flow changes here.

**Tech Stack:** existing — TypeScript, Drizzle, vitest, msw, React + tRPC client. No new shadcn primitives; checkbox lists are plain `<input type="checkbox">` styled with Tailwind, matching the existing radio pattern in the wizard's Verbs step.

**Out of scope (5c):**
- Identity step / member picker / `boundWeeekUserId` / `visibilityBound` / `authorRewrite`.
- Payload rewrites in the proxy (assignee filter injection, author rewrite on POST/PATCH bodies).
- E2E proxy test for `project_not_in_scope` deny path with a non-wildcard sub-key — covered as a backlog item; phase 5b proves the wiring via wizard + tRPC + create roundtrip.

---

## File Structure

| Path | Change |
|------|--------|
| `src/server/weeek/directory.ts` | NEW — `fetchProjects(masterKey)` and `fetchBoards(masterKey, projectId?)` thin wrappers around Weeek `/ws/projects` and `/ws/boards` |
| `src/server/weeek/cache.ts` | NEW — generic `getOrFetch(key, ttlMs, loader)` Map-backed cache |
| `src/server/trpc/routers/weeekDirectory.ts` | NEW — `projects({workspaceId})`, `boards({workspaceId, projectId?})` |
| `src/server/trpc/routers/index.ts` | MODIFY — register `weeekDirectory` |
| `src/server/trpc/routers/subKey.ts` | MODIFY — add `scopeProjects`/`scopeBoards` to `createInput`; remove TODO scope comment; pass through to insert |
| `src/components/feature/scope-step.tsx` | NEW — wizard's new Scope step (project + board checkbox lists with filter input) |
| `src/components/feature/issue-sub-key-dialog.tsx` | MODIFY — 4 steps, plumb scope state, send to mutation |
| `tests/unit/weeek-cache.test.ts` | NEW — TTL semantics + miss-then-hit |
| `tests/integration/weeek-directory.test.ts` | NEW — projects/boards happy + ownership 404 + cache hit |
| `tests/integration/sub-key-router.test.ts` | EXTEND — scope passes through to row; empty array rejected; non-array rejected |

---

## Task 0: Generic in-memory TTL cache

**Why:** Both `weeekDirectory.projects` and `weeekDirectory.boards` need the same shape. Building it once keeps phase 5c (members) trivial.

**Files:**
- Create: `src/server/weeek/cache.ts`
- Test: `tests/unit/weeek-cache.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/weeek-cache.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { getOrFetch, _resetCacheForTests } from "@/server/weeek/cache";

describe("getOrFetch", () => {
  test("calls loader once on miss, returns cached value on hit", async () => {
    _resetCacheForTests();
    const loader = vi.fn(async () => ({ value: 42 }));
    const a = await getOrFetch("k1", 60_000, loader);
    const b = await getOrFetch("k1", 60_000, loader);
    expect(a).toEqual({ value: 42 });
    expect(b).toEqual({ value: 42 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test("re-fetches after TTL expires", async () => {
    _resetCacheForTests();
    vi.useFakeTimers();
    const loader = vi.fn(async () => ({ n: Math.random() }));
    await getOrFetch("k2", 100, loader);
    vi.advanceTimersByTime(101);
    await getOrFetch("k2", 100, loader);
    expect(loader).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  test("loader rejection is not cached", async () => {
    _resetCacheForTests();
    let attempt = 0;
    const loader = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("boom");
      return { ok: true };
    });
    await expect(getOrFetch("k3", 60_000, loader)).rejects.toThrow("boom");
    const second = await getOrFetch("k3", 60_000, loader);
    expect(second).toEqual({ ok: true });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  test("different keys are isolated", async () => {
    _resetCacheForTests();
    const a = vi.fn(async () => "A");
    const b = vi.fn(async () => "B");
    expect(await getOrFetch("ka", 60_000, a)).toBe("A");
    expect(await getOrFetch("kb", 60_000, b)).toBe("B");
    expect(await getOrFetch("ka", 60_000, a)).toBe("A");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

`pnpm vitest run tests/unit/weeek-cache.test.ts`

- [ ] **Step 3: Implement**

Create `src/server/weeek/cache.ts`:

```ts
type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

export async function getOrFetch<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }
  const value = await loader();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

/** For tests only — resets the module-scoped Map. */
export function _resetCacheForTests(): void {
  store.clear();
}
```

- [ ] **Step 4: Re-run, expect PASS (4 tests)**

`pnpm vitest run tests/unit/weeek-cache.test.ts`

- [ ] **Step 5: Lint + typecheck clean**

`pnpm lint && pnpm typecheck`

- [ ] **Step 6: Commit**

```bash
git add src/server/weeek/cache.ts tests/unit/weeek-cache.test.ts
git commit -m "phase-5b task 0: in-memory TTL cache helper"
```

---

## Task 1: Weeek directory fetchers

**Why:** Pure HTTP wrappers — keep them out of the tRPC router for testability.

**Files:**
- Create: `src/server/weeek/directory.ts`
- Test: covered indirectly via the tRPC router test in task 2 (no separate unit test — these are 5-line wrappers).

- [ ] **Step 1: Implement**

Create `src/server/weeek/directory.ts`:

```ts
import { WeeekValidationError } from "./errors";

const TIMEOUT_MS = 10_000;

function getBase(): string {
  const base = process.env.WEEEK_API_BASE;
  if (!base) throw new Error("WEEEK_API_BASE is required");
  return base.replace(/\/+$/, "");
}

async function callWeeek<T>(path: string, masterKey: string): Promise<T> {
  const url = `${getBase()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${masterKey}` },
      signal: controller.signal,
    });
  } catch (err) {
    throw new WeeekValidationError(
      "network",
      `Network error contacting Weeek: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status >= 500) {
    throw new WeeekValidationError("upstream_5xx", `Weeek returned ${res.status}`, res.status);
  }
  if (res.status === 401 || res.status === 403) {
    throw new WeeekValidationError("unauthorized", "Weeek rejected the master key", res.status);
  }
  if (!res.ok) {
    throw new WeeekValidationError(
      "unexpected_status",
      `Weeek returned unexpected status ${res.status}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

export type WeeekProjectRow = { id: number | string; name: string };
export type WeeekBoardRow = { id: number | string; name: string; projectId?: number | string };

type ProjectsEnvelope = { projects?: WeeekProjectRow[] } | { data?: WeeekProjectRow[] } | WeeekProjectRow[];
type BoardsEnvelope = { boards?: WeeekBoardRow[] } | { data?: WeeekBoardRow[] } | WeeekBoardRow[];

function unwrap<T>(env: unknown, keys: readonly string[]): T[] {
  if (Array.isArray(env)) return env as T[];
  if (env && typeof env === "object") {
    const obj = env as Record<string, unknown>;
    for (const k of keys) {
      const v = obj[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

export async function fetchProjects(masterKey: string): Promise<WeeekProjectRow[]> {
  const env = await callWeeek<ProjectsEnvelope>("/ws/projects", masterKey);
  return unwrap<WeeekProjectRow>(env, ["projects", "data"]);
}

export async function fetchBoards(
  masterKey: string,
  projectId?: string,
): Promise<WeeekBoardRow[]> {
  const path = projectId
    ? `/ws/boards?projectId=${encodeURIComponent(projectId)}`
    : `/ws/boards`;
  const env = await callWeeek<BoardsEnvelope>(path, masterKey);
  return unwrap<WeeekBoardRow>(env, ["boards", "data"]);
}
```

`unwrap` defends against Weeek either returning a bare array or an envelope with `{projects: [...]}` / `{boards: [...]}` / `{data: [...]}` — confirmed shape varies by endpoint per phase-4 forward tests; this is the cheapest forward-compat.

- [ ] **Step 2: Lint + typecheck clean**

`pnpm lint && pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/server/weeek/directory.ts
git commit -m "phase-5b task 1: weeek directory fetchers (projects + boards)"
```

---

## Task 2: `weeekDirectory` tRPC router

**Why:** Wizard needs project/board choices. Behind the same authz wall as the rest of the workspace tRPC surface — only the workspace owner can list its directory.

**Files:**
- Create: `src/server/trpc/routers/weeekDirectory.ts`
- Modify: `src/server/trpc/routers/index.ts`
- Test: `tests/integration/weeek-directory.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/integration/weeek-directory.test.ts`:

```ts
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const WEEEK_BASE = "https://weeek.test/public/v1";
const server = setupServer();

beforeAll(() => {
  process.env.MASTER_KEY_ENC_KEY ||= randomBytes(32).toString("base64");
  process.env.FINGERPRINT_HMAC_PEPPER ||= randomBytes(32).toString("base64");
  process.env.SUB_KEY_HMAC_PEPPER ||= randomBytes(32).toString("base64");
  process.env.WEEEK_API_BASE = WEEEK_BASE;
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function setup() {
  const uid = `dir-user-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const { db } = await import("@/server/db/client");
  const { user } = await import("@/server/db/schema/auth");
  await db
    .insert(user)
    .values({ id: uid, name: uid, email: `${uid}@x.test`, emailVerified: true })
    .onConflictDoNothing();
  server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ success: true })));
  const { appRouter } = await import("@/server/trpc/routers");
  const caller = appRouter.createCaller({
    session: {
      user: { id: uid, email: `${uid}@x.test`, name: uid },
      session: { id: `s-${uid}`, token: `t-${uid}` },
    } as never,
    headers: new Headers(),
  });
  const ws = await caller.workspace.import({
    name: "dir ws",
    masterKey: `wk_dir_${uid}_aaaaaaaaaaaaaaaa`,
  });
  return { uid, caller, workspaceId: ws.id };
}

describe("weeekDirectory router", () => {
  test("projects: returns list, hits Weeek with master key, caches", async () => {
    const { _resetCacheForTests } = await import("@/server/weeek/cache");
    _resetCacheForTests();
    const seeded = await setup();
    let calls = 0;
    server.use(
      http.get(`${WEEEK_BASE}/ws/projects`, ({ request }) => {
        calls += 1;
        expect(request.headers.get("authorization")).toBe(
          `Bearer wk_dir_${seeded.uid}_aaaaaaaaaaaaaaaa`,
        );
        return HttpResponse.json({ projects: [{ id: "p1", name: "Alpha" }] });
      }),
    );
    const a = await seeded.caller.weeekDirectory.projects({ workspaceId: seeded.workspaceId });
    const b = await seeded.caller.weeekDirectory.projects({ workspaceId: seeded.workspaceId });
    expect(a).toEqual([{ id: "p1", name: "Alpha" }]);
    expect(b).toEqual([{ id: "p1", name: "Alpha" }]);
    expect(calls).toBe(1); // 60s cache
  });

  test("projects: NOT_FOUND for someone else's workspace", async () => {
    const a = await setup();
    const b = await setup();
    await expect(
      b.caller.weeekDirectory.projects({ workspaceId: a.workspaceId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("boards: passes projectId through and caches separately", async () => {
    const { _resetCacheForTests } = await import("@/server/weeek/cache");
    _resetCacheForTests();
    const seeded = await setup();
    server.use(
      http.get(`${WEEEK_BASE}/ws/boards`, ({ request }) => {
        const url = new URL(request.url);
        return HttpResponse.json({
          boards: [{ id: "b1", name: `for-${url.searchParams.get("projectId")}` }],
        });
      }),
    );
    const out = await seeded.caller.weeekDirectory.boards({
      workspaceId: seeded.workspaceId,
      projectId: "p7",
    });
    expect(out).toEqual([{ id: "b1", name: "for-p7" }]);
  });

  test("boards: omits projectId when not provided", async () => {
    const { _resetCacheForTests } = await import("@/server/weeek/cache");
    _resetCacheForTests();
    const seeded = await setup();
    let observedQuery: string | null = null;
    server.use(
      http.get(`${WEEEK_BASE}/ws/boards`, ({ request }) => {
        const url = new URL(request.url);
        observedQuery = url.search;
        return HttpResponse.json({ boards: [] });
      }),
    );
    await seeded.caller.weeekDirectory.boards({ workspaceId: seeded.workspaceId });
    expect(observedQuery).toBe("");
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`Cannot find module '@/server/trpc/routers/weeekDirectory'`)

`pnpm vitest run tests/integration/weeek-directory.test.ts`

- [ ] **Step 3: Implement the router**

Create `src/server/trpc/routers/weeekDirectory.ts`:

```ts
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { weeekWorkspace } from "@/server/db/schema/workspace";
import { decrypt } from "@/server/crypto/aesGcm";
import { fetchBoards, fetchProjects } from "@/server/weeek/directory";
import { getOrFetch } from "@/server/weeek/cache";
import { protectedProcedure, router } from "../init";

const TTL_MS = 60_000;

async function loadMasterKey(workspaceId: string, userId: string): Promise<string> {
  const [row] = await db
    .select({
      ciphertext: weeekWorkspace.masterKeyCiphertext,
      iv: weeekWorkspace.masterKeyIv,
      tag: weeekWorkspace.masterKeyTag,
      encVersion: weeekWorkspace.encVersion,
    })
    .from(weeekWorkspace)
    .where(
      and(
        eq(weeekWorkspace.id, workspaceId),
        eq(weeekWorkspace.ownerType, "user"),
        eq(weeekWorkspace.ownerId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
  return decrypt({
    ciphertext: row.ciphertext,
    iv: row.iv,
    tag: row.tag,
    encVersion: row.encVersion,
  });
}

const projectsInput = z.object({ workspaceId: z.string().min(1) });
const boardsInput = z.object({
  workspaceId: z.string().min(1),
  projectId: z.string().min(1).optional(),
});

export const weeekDirectoryRouter = router({
  projects: protectedProcedure.input(projectsInput).query(async ({ ctx, input }) => {
    const masterKey = await loadMasterKey(input.workspaceId, ctx.session.user.id);
    return getOrFetch(`projects:${input.workspaceId}`, TTL_MS, () => fetchProjects(masterKey));
  }),

  boards: protectedProcedure.input(boardsInput).query(async ({ ctx, input }) => {
    const masterKey = await loadMasterKey(input.workspaceId, ctx.session.user.id);
    const cacheKey = `boards:${input.workspaceId}:${input.projectId ?? "*"}`;
    return getOrFetch(cacheKey, TTL_MS, () => fetchBoards(masterKey, input.projectId));
  }),
});
```

- [ ] **Step 4: Register the router in `src/server/trpc/routers/index.ts`**

```ts
import { router } from "../init";
import { meRouter } from "./me";
import { workspaceRouter } from "./workspace";
import { subKeyRouter } from "./subKey";
import { weeekDirectoryRouter } from "./weeekDirectory";

export const appRouter = router({
  me: meRouter,
  workspace: workspaceRouter,
  subKey: subKeyRouter,
  weeekDirectory: weeekDirectoryRouter,
});
export type AppRouter = typeof appRouter;
```

- [ ] **Step 5: Re-run, expect 4/4 PASS**

`pnpm vitest run tests/integration/weeek-directory.test.ts`

- [ ] **Step 6: Lint + typecheck clean**

`pnpm lint && pnpm typecheck`

- [ ] **Step 7: Commit**

```bash
git add src/server/trpc/routers/weeekDirectory.ts src/server/trpc/routers/index.ts tests/integration/weeek-directory.test.ts
git commit -m "phase-5b task 2: weeekDirectory tRPC (projects + boards) with 60s TTL cache"
```

---

## Task 3: `subKey.create` accepts scope from input

**Files:**
- Modify: `src/server/trpc/routers/subKey.ts`
- Modify: `tests/integration/sub-key-router.test.ts`

- [ ] **Step 1: Failing tests — extend `tests/integration/sub-key-router.test.ts`**

Append inside the existing `describe("subKey router", ...)` block:

```ts
  test("create with explicit scopeProjects/scopeBoards persists them", async () => {
    const uid = `sk-user-${Date.now()}-scope`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS scope");
    const caller = await makeCaller(uid);
    const created = await caller.subKey.create({
      workspaceId: wsId,
      label: "scoped",
      preset: "read-only",
      scopeProjects: ["p1", "p2"],
      scopeBoards: ["b1"],
    });
    expect(created.subKey.scopeProjects).toEqual(["p1", "p2"]);
    expect(created.subKey.scopeBoards).toEqual(["b1"]);
  });

  test("create defaults scope to ['*'] when omitted (backwards-compat)", async () => {
    const uid = `sk-user-${Date.now()}-scope-default`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS scope default");
    const caller = await makeCaller(uid);
    const created = await caller.subKey.create({
      workspaceId: wsId,
      label: "no scope",
      preset: "read-only",
    });
    expect(created.subKey.scopeProjects).toEqual(["*"]);
    expect(created.subKey.scopeBoards).toEqual(["*"]);
  });

  test("create rejects empty scopeProjects array", async () => {
    const uid = `sk-user-${Date.now()}-scope-empty`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS scope empty");
    const caller = await makeCaller(uid);
    await expect(
      caller.subKey.create({
        workspaceId: wsId,
        label: "empty",
        preset: "read-only",
        scopeProjects: [],
        scopeBoards: ["*"],
      }),
    ).rejects.toThrow();
  });

  test("create rejects empty scopeBoards array", async () => {
    const uid = `sk-user-${Date.now()}-scope-empty-b`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS scope empty b");
    const caller = await makeCaller(uid);
    await expect(
      caller.subKey.create({
        workspaceId: wsId,
        label: "empty b",
        preset: "read-only",
        scopeProjects: ["*"],
        scopeBoards: [],
      }),
    ).rejects.toThrow();
  });
```

- [ ] **Step 2: Run, expect 4 new FAILs**

`pnpm vitest run tests/integration/sub-key-router.test.ts`

- [ ] **Step 3: Modify `createInput` in `src/server/trpc/routers/subKey.ts`**

Replace the existing `createInput` declaration (top of file) with:

```ts
const scopeArrayInput = z
  .array(z.string().min(1))
  .min(1, "Must include at least one id, or '*' for wildcard");

const createInput = z.object({
  workspaceId: z.string().min(1),
  label: z.string().trim().min(1, "Label is required").max(80),
  preset: presetEnum,
  scopeProjects: scopeArrayInput.optional(),
  scopeBoards: scopeArrayInput.optional(),
});
```

Then in the `create` mutation body, replace the hardcoded `scopeProjects`/`scopeBoards` (lines around 124 — already has the TODO comment from phase 4 task 0):

```ts
          scopeProjects: input.scopeProjects ?? ["*"],
          scopeBoards: input.scopeBoards ?? ["*"],
```

(Remove the `// TODO(phase-5): ...` block of 3 comment lines now that scope is wired.)

- [ ] **Step 4: Re-run sub-key router tests**

`pnpm vitest run tests/integration/sub-key-router.test.ts`
Expected: existing 9 + 4 new = 13/13.

- [ ] **Step 5: Run full suite**

`pnpm test` — all green. (Phase 5a baseline 135 + 4 cache + 4 directory + 4 sub-key = 147.)

- [ ] **Step 6: Lint + typecheck clean**

`pnpm lint && pnpm typecheck`

- [ ] **Step 7: Commit**

```bash
git add src/server/trpc/routers/subKey.ts tests/integration/sub-key-router.test.ts
git commit -m "phase-5b task 3: subKey.create accepts scopeProjects/scopeBoards (defaults ['*'])"
```

---

## Task 4: Wizard gains a Scope step

**Why:** UI surface for the new input. Plain checkbox lists with a filter input — no new shadcn primitives.

**Files:**
- Create: `src/components/feature/scope-step.tsx`
- Modify: `src/components/feature/issue-sub-key-dialog.tsx`

- [ ] **Step 1: Create the Scope step component**

Create `src/components/feature/scope-step.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc-client";

type Props = {
  workspaceId: string;
  scopeProjects: readonly string[];
  scopeBoards: readonly string[];
  onChange: (next: { scopeProjects: string[]; scopeBoards: string[] }) => void;
};

const ALL = "*" as const;

function isWildcard(scope: readonly string[]): boolean {
  return scope.length === 1 && scope[0] === ALL;
}

export function ScopeStep({ workspaceId, scopeProjects, scopeBoards, onChange }: Props) {
  const [projectFilter, setProjectFilter] = useState("");
  const [boardFilter, setBoardFilter] = useState("");

  const projectsAll = isWildcard(scopeProjects);
  const boardsAll = isWildcard(scopeBoards);

  // Boards picker only loads when projects are pinned — avoids a giant flat list.
  const projectsQ = trpc.weeekDirectory.projects.useQuery({ workspaceId });
  const selectedForBoards = projectsAll ? undefined : scopeProjects;
  const boardsQ = trpc.weeekDirectory.boards.useQuery(
    {
      workspaceId,
      ...(selectedForBoards && selectedForBoards.length === 1
        ? { projectId: selectedForBoards[0] }
        : {}),
    },
    { enabled: projectsAll || (selectedForBoards?.length ?? 0) >= 1 },
  );

  const projects = projectsQ.data ?? [];
  const boards = boardsQ.data ?? [];

  const filteredProjects = useMemo(() => {
    const f = projectFilter.trim().toLowerCase();
    if (!f) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(f));
  }, [projects, projectFilter]);

  const filteredBoards = useMemo(() => {
    const f = boardFilter.trim().toLowerCase();
    if (!f) return boards;
    return boards.filter((b) => b.name.toLowerCase().includes(f));
  }, [boards, boardFilter]);

  function setProjectsAll(checked: boolean) {
    if (checked) {
      onChange({ scopeProjects: [ALL], scopeBoards });
    } else {
      onChange({ scopeProjects: [], scopeBoards });
    }
  }

  function toggleProject(id: string, checked: boolean) {
    const current = projectsAll ? [] : scopeProjects.filter((s) => s !== ALL);
    const next = checked ? [...current, id] : current.filter((x) => x !== id);
    onChange({ scopeProjects: next, scopeBoards });
  }

  function setBoardsAll(checked: boolean) {
    if (checked) {
      onChange({ scopeProjects, scopeBoards: [ALL] });
    } else {
      onChange({ scopeProjects, scopeBoards: [] });
    }
  }

  function toggleBoard(id: string, checked: boolean) {
    const current = boardsAll ? [] : scopeBoards.filter((s) => s !== ALL);
    const next = checked ? [...current, id] : current.filter((x) => x !== id);
    onChange({ scopeProjects, scopeBoards: next });
  }

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        Limit which projects and boards this sub-key can touch. Default is everything.
      </p>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>Projects</Label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={projectsAll}
              onChange={(e) => setProjectsAll(e.target.checked)}
            />
            All projects
          </label>
        </div>
        <Input
          placeholder="Filter projects…"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          disabled={projectsAll}
        />
        <div className="max-h-32 overflow-auto rounded-md border p-2">
          {projectsQ.isLoading ? (
            <p className="text-muted-foreground text-xs">Loading…</p>
          ) : projectsQ.error ? (
            <p className="text-destructive text-xs">{projectsQ.error.message}</p>
          ) : filteredProjects.length === 0 ? (
            <p className="text-muted-foreground text-xs">No projects.</p>
          ) : (
            filteredProjects.map((p) => {
              const id = String(p.id);
              const checked = projectsAll || scopeProjects.includes(id);
              return (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-2 py-0.5 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={projectsAll}
                    onChange={(e) => toggleProject(id, e.target.checked)}
                  />
                  <span>{p.name}</span>
                </label>
              );
            })
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>Boards</Label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={boardsAll}
              onChange={(e) => setBoardsAll(e.target.checked)}
            />
            All boards
          </label>
        </div>
        <Input
          placeholder="Filter boards…"
          value={boardFilter}
          onChange={(e) => setBoardFilter(e.target.value)}
          disabled={boardsAll}
        />
        <div className="max-h-32 overflow-auto rounded-md border p-2">
          {!projectsAll && scopeProjects.length === 0 ? (
            <p className="text-muted-foreground text-xs">Pick a project to load boards.</p>
          ) : boardsQ.isLoading ? (
            <p className="text-muted-foreground text-xs">Loading…</p>
          ) : boardsQ.error ? (
            <p className="text-destructive text-xs">{boardsQ.error.message}</p>
          ) : filteredBoards.length === 0 ? (
            <p className="text-muted-foreground text-xs">No boards.</p>
          ) : (
            filteredBoards.map((b) => {
              const id = String(b.id);
              const checked = boardsAll || scopeBoards.includes(id);
              return (
                <label key={id} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={boardsAll}
                    onChange={(e) => toggleBoard(id, e.target.checked)}
                  />
                  <span>{b.name}</span>
                </label>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the new step into `issue-sub-key-dialog.tsx`**

Open `src/components/feature/issue-sub-key-dialog.tsx`. Make these changes:

1. Add the import at the top:
   ```tsx
   import { ScopeStep } from "./scope-step";
   ```

2. Change `type Step = 1 | 2 | 3;` to `type Step = 1 | 2 | 3 | 4;`

3. After `const [preset, setPreset] = useState<PresetKey>("read-only");`, add:
   ```tsx
   const [scopeProjects, setScopeProjects] = useState<readonly string[]>(["*"]);
   const [scopeBoards, setScopeBoards] = useState<readonly string[]>(["*"]);
   ```

4. In `reset()` add resets:
   ```tsx
   setScopeProjects(["*"]);
   setScopeBoards(["*"]);
   ```

5. Replace `previewPolicy()` body to use the live state:
   ```tsx
   function previewPolicy() {
     return JSON.stringify(
       {
         label,
         preset,
         scope_projects: [...scopeProjects],
         scope_boards: [...scopeBoards],
         verbs: [...expandPreset(preset)],
       },
       null,
       2,
     );
   }
   ```

6. Update the step description in `<DialogDescription>`:
   ```tsx
   <DialogDescription>
     Step {step} of 4: {step === 1 ? "Identity" : step === 2 ? "Scope" : step === 3 ? "Verbs" : "Review"}
   </DialogDescription>
   ```

7. Insert a new step-2 block between the existing step-1 (label) and what is currently step-2 (preset, which becomes step-3):
   ```tsx
   {step === 2 ? (
     <ScopeStep
       workspaceId={workspaceId}
       scopeProjects={scopeProjects}
       scopeBoards={scopeBoards}
       onChange={({ scopeProjects: p, scopeBoards: b }) => {
         setScopeProjects(p);
         setScopeBoards(b);
       }}
     />
   ) : null}
   ```

8. Renumber the existing preset block from `step === 2` to `step === 3`, and the review block from `step === 3` to `step === 4`.

9. Update navigation: `step < 3` → `step < 4`; the `Next` button's disabled rule must also block step 2 with empty scope:
   ```tsx
   const scopeValid = scopeProjects.length > 0 && scopeBoards.length > 0;
   // ...
   <Button
     type="button"
     disabled={
       (step === 1 && label.trim().length === 0) ||
       (step === 2 && !scopeValid)
     }
     onClick={() => setStep(((step + 1) as Step) || 4)}
   >
     Next
   </Button>
   ```

10. Update the create-mutation invocation to pass scope through:
    ```tsx
    createMutation.mutate({
      workspaceId,
      label: label.trim(),
      preset,
      scopeProjects: [...scopeProjects],
      scopeBoards: [...scopeBoards],
    })
    ```

- [ ] **Step 3: Run lint + typecheck**

`pnpm lint && pnpm typecheck`

If `tsc` complains about `readonly string[]` not assignable to `string[]`, the spread `[...scopeProjects]` already coerces — make sure that's where the value flows into the mutation.

- [ ] **Step 4: Run the full test suite**

`pnpm test`
Expected: still green. UI components don't have unit tests in this repo; the integration coverage from tasks 0-3 is what gates this commit.

- [ ] **Step 5: Manual smoke (DO NOT run dev server in the subagent — defer this to the controller)**

The subagent reports DONE_WITH_CONCERNS noting that the dev server smoke is the controller's responsibility (the subagent has no `.env` to start Next).

- [ ] **Step 6: Commit**

```bash
git add src/components/feature/scope-step.tsx src/components/feature/issue-sub-key-dialog.tsx
git commit -m "phase-5b task 4: wizard adds Scope step (projects + boards pickers)"
```

---

## Task 5: Plan doc commit

- [ ] **Step 1**

```bash
git add docs/superpowers/plans/2026-05-07-phase-5b-scope.md
git commit -m "docs: phase 5b plan"
```

---

## Self-Review Checklist

- **Spec coverage:** §11 wizard step 2 (Scope: projects multi-select, boards multi-select scoped to chosen projects) → tasks 4. §9 `weeekDirectory.projects/boards` → task 2. §7.2 sub-key policy `project_id ∈ scope_projects ∨ scope=['*']` → task 3 (data flow); enforcement in `policyEval.ts` is unchanged from phase 4.
- **Placeholders:** none.
- **Type consistency:** `scopeArrayInput` reused in `subKey.create`. `Step` type widened to 4. `WeeekProjectRow`/`WeeekBoardRow` shared between `directory.ts` and the router.
- **Backwards compat:** `subKey.create` still accepts callers that omit scope (defaults to `['*']`). Phase-4 integration tests that didn't pass scope keep passing.
- **Backlog produced for 5c:** member picker + identity step; payload rewrites; E2E proxy test asserting `403 project_not_in_scope` against a non-wildcard sub-key (currently only unit-level coverage). Documented in `phase_4_scope_and_backlog.md` already.

---

**Plan complete.** Execution: subagent-driven where credits allow; controller can run mechanical sub-tasks inline if rate-limited (matches the 5a fallback).
