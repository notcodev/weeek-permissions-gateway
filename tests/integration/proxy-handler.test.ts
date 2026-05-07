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

  test("403 unknown_route for POST (write verbs deferred)", async () => {
    const seeded = await setup("read-only");
    const { proxy } = await import("@/server/proxy/handler");
    const res = await proxy(gatewayReq(seeded.rawKey, "/ws/projects", "POST"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unknown_route");
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
    server.use(http.get(`${WEEEK_BASE}/ws/projects`, () => HttpResponse.error()));
    const { proxy } = await import("@/server/proxy/handler");
    const res = await proxy(gatewayReq(seeded.rawKey, "/ws/projects"));
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
      http.get(`${WEEEK_BASE}/ws/tasks`, ({ request }) => {
        observedUrl = request.url;
        return HttpResponse.json({ tasks: [] });
      }),
    );
    const { proxy } = await import("@/server/proxy/handler");
    const res = await proxy(gatewayReq(seeded.rawKey, "/ws/tasks?projectId=42"));
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
});
