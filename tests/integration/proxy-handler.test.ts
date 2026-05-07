import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { eq } from "drizzle-orm";

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

async function setup(preset: "read-only" | "task-automator" | "full-access") {
  const uid = `proxy-user-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
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
    name: "proxy ws",
    masterKey: `wk_master_${uid}_aaaaaaaaaaaaaaaa`,
  });
  const sk = await caller.subKey.create({ workspaceId: ws.id, label: "k", preset });
  return { uid, workspaceId: ws.id, rawKey: sk.rawKey, subKeyId: sk.subKey.id };
}

function gatewayReq(rawKey: string | null, path: string, method = "GET", body?: BodyInit) {
  const headers = new Headers();
  if (rawKey) headers.set("authorization", `Bearer ${rawKey}`);
  return new Request(`https://gw.test/api/v1${path}`, { method, headers, body });
}

describe("proxy handler matrix", () => {
  test("401 when no bearer", async () => {
    const { proxy } = await import("@/server/proxy/handler");
    const res = await proxy(gatewayReq(null, "/ws/members"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthenticated");
  });

  test("401 when bearer doesn't decode to a known sub-key", async () => {
    const { proxy } = await import("@/server/proxy/handler");
    const res = await proxy(gatewayReq("wgw_obviously_not_real", "/ws/members"));
    expect(res.status).toBe(401);
  });

  test("403 unknown_route on a path we haven't mapped", async () => {
    const seeded = await setup("full-access");
    const { proxy } = await import("@/server/proxy/handler");
    const res = await proxy(gatewayReq(seeded.rawKey, "/ws/this-doesnt-exist"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; subKeyId: string } };
    expect(body.error.code).toBe("unknown_route");
    expect(body.error.subKeyId).toBe(seeded.subKeyId.slice(0, 8));
  });

  test("403 verb_missing for POST /tm/projects on read-only preset", async () => {
    const seeded = await setup("read-only");
    const { proxy } = await import("@/server/proxy/handler");
    const res = await proxy(gatewayReq(seeded.rawKey, "/tm/projects", "POST"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("verb_missing");
  });

  test("200 passthrough on allowed read", async () => {
    const seeded = await setup("read-only");
    server.use(
      http.get(`${WEEEK_BASE}/ws/members`, ({ request }) => {
        const auth = request.headers.get("authorization");
        expect(auth).toBe(`Bearer wk_master_${seeded.uid}_aaaaaaaaaaaaaaaa`);
        return HttpResponse.json({ success: true, members: [{ id: 1 }] });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const res = await proxy(gatewayReq(seeded.rawKey, "/ws/members"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; members: { id: number }[] };
    expect(body.members[0]?.id).toBe(1);
  });

  test("502 upstream_error when Weeek is unreachable", async () => {
    const seeded = await setup("read-only");
    server.use(http.get(`${WEEEK_BASE}/tm/projects`, () => HttpResponse.error()));
    const { proxy } = await import("@/server/proxy/handler");
    const res = await proxy(gatewayReq(seeded.rawKey, "/tm/projects"));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("upstream_error");
    // Internal header must be stripped before reaching the consumer.
    expect(res.headers.get("x-proxy-upstream-status")).toBeNull();
  });

  test("query string is forwarded", async () => {
    const seeded = await setup("read-only");
    let observedUrl = "";
    server.use(
      http.get(`${WEEEK_BASE}/tm/tasks`, ({ request }) => {
        observedUrl = request.url;
        return HttpResponse.json({ tasks: [] });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const res = await proxy(gatewayReq(seeded.rawKey, "/tm/tasks?projectId=42"));
    expect(res.status).toBe(200);
    expect(observedUrl).toContain("projectId=42");
  });

  test("audit hook updates lastUsedAt + useCount on success", async () => {
    const seeded = await setup("read-only");
    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ success: true })));
    const { proxy } = await import("@/server/proxy/handler");
    await proxy(gatewayReq(seeded.rawKey, "/ws/members"));
    // Give the fire-and-forget update time to land.
    await new Promise((r) => setTimeout(r, 300));

    const { db } = await import("@/server/db/client");
    const { subKey } = await import("@/server/db/schema/subKey");
    const [row] = await db.select().from(subKey).where(eq(subKey.id, seeded.subKeyId)).limit(1);
    expect(row?.useCount).toBeGreaterThanOrEqual(1);
    expect(row?.lastUsedAt).toBeInstanceOf(Date);
  });

  test("requestId is unique per request and surfaces in error envelope", async () => {
    const { proxy } = await import("@/server/proxy/handler");
    const res1 = await proxy(gatewayReq(null, "/ws/members"));
    const res2 = await proxy(gatewayReq(null, "/ws/members"));
    const b1 = (await res1.json()) as { error: { requestId: string } };
    const b2 = (await res2.json()) as { error: { requestId: string } };
    expect(b1.error.requestId).not.toBe(b2.error.requestId);
    expect(b1.error.requestId.length).toBeGreaterThan(8);
  });

  // --- Phase 5a: write/delete verbs ---

  test("POST /tm/tasks succeeds for task-automator preset and forwards the body", async () => {
    const seeded = await setup("task-automator");
    let receivedBody: unknown;
    let observedAuth = "";
    server.use(
      http.post(`${WEEEK_BASE}/tm/tasks`, async ({ request }) => {
        observedAuth = request.headers.get("authorization") ?? "";
        receivedBody = await request.json();
        return HttpResponse.json({ id: "task_new" }, { status: 201 });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    headers.set("content-type", "application/json");
    const req = new Request("https://gw.test/api/v1/tm/tasks", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "hello", boardId: "b1" }),
    });
    const res = await proxy(req);
    expect(res.status).toBe(201);
    expect(observedAuth).toBe(`Bearer wk_master_${seeded.uid}_aaaaaaaaaaaaaaaa`);
    expect(receivedBody).toEqual({ title: "hello", boardId: "b1" });
  });

  test("POST /tm/tasks denied with verb_missing for read-only preset", async () => {
    const seeded = await setup("read-only");
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    headers.set("content-type", "application/json");
    const req = new Request("https://gw.test/api/v1/tm/tasks", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "x" }),
    });
    const res = await proxy(req);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("verb_missing");
  });

  test("DELETE /tm/tasks/123 denied for task-automator (no tasks:delete)", async () => {
    const seeded = await setup("task-automator");
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    const req = new Request("https://gw.test/api/v1/tm/tasks/123", {
      method: "DELETE",
      headers,
    });
    const res = await proxy(req);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("verb_missing");
  });

  test("DELETE /tm/tasks/123 succeeds for full-access preset", async () => {
    const seeded = await setup("full-access");
    server.use(
      http.delete(`${WEEEK_BASE}/tm/tasks/123`, () =>
        HttpResponse.json({ ok: true }, { status: 200 }),
      ),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    const req = new Request("https://gw.test/api/v1/tm/tasks/123", {
      method: "DELETE",
      headers,
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);
  });

  test("POST /tm/tasks/123/complete uses tasks:complete verb (granted by task-automator)", async () => {
    const seeded = await setup("task-automator");
    let hit = false;
    server.use(
      http.post(`${WEEEK_BASE}/tm/tasks/123/complete`, () => {
        hit = true;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    const req = new Request("https://gw.test/api/v1/tm/tasks/123/complete", {
      method: "POST",
      headers,
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(hit).toBe(true);
  });

  test("POST /tm/tasks/123/board uses tasks:move verb (granted by task-automator)", async () => {
    const seeded = await setup("task-automator");
    let hit = false;
    server.use(
      http.post(`${WEEEK_BASE}/tm/tasks/123/board`, () => {
        hit = true;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    const req = new Request("https://gw.test/api/v1/tm/tasks/123/board", {
      method: "POST",
      headers,
      body: JSON.stringify({ boardId: "b2" }),
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(hit).toBe(true);
  });

  test("POST /tm/tasks/123/board-column also uses tasks:move verb", async () => {
    const seeded = await setup("task-automator");
    let hit = false;
    server.use(
      http.post(`${WEEEK_BASE}/tm/tasks/123/board-column`, () => {
        hit = true;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    const req = new Request("https://gw.test/api/v1/tm/tasks/123/board-column", {
      method: "POST",
      headers,
      body: JSON.stringify({ boardColumnId: "c1" }),
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(hit).toBe(true);
  });

  test("POST upstream 5xx is NOT retried (body is non-null)", async () => {
    const seeded = await setup("full-access");
    let calls = 0;
    server.use(
      http.post(`${WEEEK_BASE}/tm/tasks`, () => {
        calls += 1;
        return HttpResponse.json({ err: "boom" }, { status: 503 });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    headers.set("content-type", "application/json");
    const req = new Request("https://gw.test/api/v1/tm/tasks", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "x" }),
    });
    const res = await proxy(req);
    expect(res.status).toBe(503);
    expect(calls).toBe(1);
  });

  test("PUT /tm/tasks/abc forwards PUT method and body", async () => {
    const seeded = await setup("full-access");
    let observedMethod = "";
    let observedBody: unknown;
    server.use(
      http.put(`${WEEEK_BASE}/tm/tasks/abc`, async ({ request }) => {
        observedMethod = request.method;
        observedBody = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    headers.set("content-type", "application/json");
    const req = new Request("https://gw.test/api/v1/tm/tasks/abc", {
      method: "PUT",
      headers,
      body: JSON.stringify({ title: "renamed" }),
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(observedMethod).toBe("PUT");
    expect(observedBody).toEqual({ title: "renamed" });
  });

  // --- Phase 5c: visibility filter + author rewrite ---

  async function setupBound(opts: { visibilityBound: boolean; authorRewrite: boolean }) {
    const seeded = await setup("full-access");
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

  test("GET /tm/tasks injects userId when visibilityBound", async () => {
    const seeded = await setupBound({ visibilityBound: true, authorRewrite: false });
    let observedQuery: string | null = null;
    server.use(
      http.get(`${WEEEK_BASE}/tm/tasks`, ({ request }) => {
        observedQuery = new URL(request.url).search;
        return HttpResponse.json({ tasks: [] });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    const res = await proxy(
      new Request("https://gw.test/api/v1/tm/tasks", { method: "GET", headers }),
    );
    expect(res.status).toBe(200);
    expect(observedQuery).toContain("userId=u-bound");
  });

  test("GET /tm/tasks/abc does NOT inject userId (single resource, not list)", async () => {
    const seeded = await setupBound({ visibilityBound: true, authorRewrite: false });
    let observedQuery: string | null = null;
    server.use(
      http.get(`${WEEEK_BASE}/tm/tasks/abc`, ({ request }) => {
        observedQuery = new URL(request.url).search;
        return HttpResponse.json({ id: "abc" });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    const res = await proxy(
      new Request("https://gw.test/api/v1/tm/tasks/abc", { method: "GET", headers }),
    );
    expect(res.status).toBe(200);
    expect(observedQuery).toBe("");
  });

  test("GET /tm/projects does NOT inject userId (resource not in spec list)", async () => {
    const seeded = await setupBound({ visibilityBound: true, authorRewrite: false });
    let observedQuery: string | null = null;
    server.use(
      http.get(`${WEEEK_BASE}/tm/projects`, ({ request }) => {
        observedQuery = new URL(request.url).search;
        return HttpResponse.json({ projects: [] });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    const res = await proxy(
      new Request("https://gw.test/api/v1/tm/projects", { method: "GET", headers }),
    );
    expect(res.status).toBe(200);
    expect(observedQuery).toBe("");
  });

  test("POST /tm/tasks injects userId in body when authorRewrite", async () => {
    const seeded = await setupBound({ visibilityBound: false, authorRewrite: true });
    let observedBody: unknown;
    server.use(
      http.post(`${WEEEK_BASE}/tm/tasks`, async ({ request }) => {
        observedBody = await request.json();
        return HttpResponse.json({ id: "task_new" });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    headers.set("content-type", "application/json");
    const res = await proxy(
      new Request("https://gw.test/api/v1/tm/tasks", {
        method: "POST",
        headers,
        body: JSON.stringify({ title: "hello" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(observedBody).toEqual({ title: "hello", userId: "u-bound" });
  });

  test("POST /tm/tasks does NOT overwrite caller-provided userId", async () => {
    const seeded = await setupBound({ visibilityBound: false, authorRewrite: true });
    let observedBody: unknown;
    server.use(
      http.post(`${WEEEK_BASE}/tm/tasks`, async ({ request }) => {
        observedBody = await request.json();
        return HttpResponse.json({ id: "x" });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    headers.set("content-type", "application/json");
    const res = await proxy(
      new Request("https://gw.test/api/v1/tm/tasks", {
        method: "POST",
        headers,
        body: JSON.stringify({ title: "x", userId: "u-self" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(observedBody).toEqual({ title: "x", userId: "u-self" });
  });

  test("flags off: no rewrite happens", async () => {
    const seeded = await setupBound({ visibilityBound: false, authorRewrite: false });
    let observedQuery: string | null = null;
    let observedBody: unknown;
    server.use(
      http.get(`${WEEEK_BASE}/tm/tasks`, ({ request }) => {
        observedQuery = new URL(request.url).search;
        return HttpResponse.json({ tasks: [] });
      }),
      http.post(`${WEEEK_BASE}/tm/tasks`, async ({ request }) => {
        observedBody = await request.json();
        return HttpResponse.json({ id: "x" });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    headers.set("content-type", "application/json");
    await proxy(new Request("https://gw.test/api/v1/tm/tasks", { method: "GET", headers }));
    expect(observedQuery).toBe("");

    await proxy(
      new Request("https://gw.test/api/v1/tm/tasks", {
        method: "POST",
        headers,
        body: JSON.stringify({ title: "x" }),
      }),
    );
    expect(observedBody).toEqual({ title: "x" });
  });
});
