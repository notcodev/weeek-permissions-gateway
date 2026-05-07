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
    expect(calls).toBe(1);
  });

  test("projects: NOT_FOUND for someone else's workspace", async () => {
    const a = await setup();
    const b = await setup();
    await expect(
      b.caller.weeekDirectory.projects({ workspaceId: a.workspaceId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("boards: passes projectId through", async () => {
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
