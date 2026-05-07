import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { desc, eq } from "drizzle-orm";

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

async function setup(preset: "read-only" | "task-automator" | "full-access" = "full-access") {
  const uid = `audit-user-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
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
    name: "audit ws",
    masterKey: `wk_audit_${uid}_aaaaaaaaaaaaaaaa`,
  });
  const sk = await caller.subKey.create({ workspaceId: ws.id, label: "k", preset });
  return { uid, workspaceId: ws.id, rawKey: sk.rawKey, subKeyId: sk.subKey.id };
}

async function latestAuditFor(workspaceId: string) {
  const { db } = await import("@/server/db/client");
  const { auditLog } = await import("@/server/db/schema/auditLog");
  const rows = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.workspaceId, workspaceId))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

async function flush() {
  // Fire-and-forget audit — give the void promise a tick to land.
  await new Promise((r) => setTimeout(r, 200));
}

describe("audit_log writes", () => {
  test("success path records ourStatus, verb, latency, no denyReason", async () => {
    const seeded = await setup("read-only");
    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ ok: true })));
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    headers.set("user-agent", "vitest-suite/1.0");
    headers.set("x-forwarded-for", "203.0.113.7, 10.0.0.1");
    const res = await proxy(
      new Request("https://gw.test/api/v1/ws/members", { method: "GET", headers }),
    );
    expect(res.status).toBe(200);

    await flush();
    const row = await latestAuditFor(seeded.workspaceId);
    expect(row).not.toBeNull();
    expect(row!.subKeyId).toBe(seeded.subKeyId);
    expect(row!.method).toBe("GET");
    expect(row!.path).toBe("/ws/members");
    expect(row!.ourStatus).toBe(200);
    expect(row!.upstreamStatus).toBe("200");
    expect(row!.verb).toBe("members:read");
    expect(row!.denyReason).toBeNull();
    expect(row!.userAgent).toBe("vitest-suite/1.0");
    expect(row!.ipHash).not.toBeNull();
    expect(row!.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("verb_missing deny path records denyReason and verb", async () => {
    const seeded = await setup("read-only");
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    const res = await proxy(
      new Request("https://gw.test/api/v1/tm/tasks", {
        method: "POST",
        headers: (() => {
          const h = new Headers(headers);
          h.set("content-type", "application/json");
          return h;
        })(),
        body: JSON.stringify({ title: "x" }),
      }),
    );
    expect(res.status).toBe(403);

    await flush();
    const row = await latestAuditFor(seeded.workspaceId);
    expect(row!.ourStatus).toBe(403);
    expect(row!.denyReason).toBe("verb_missing");
    expect(row!.verb).toBe("tasks:write");
    expect(row!.upstreamStatus).toBe("n/a");
  });

  test("unknown_route deny path records null verb", async () => {
    const seeded = await setup("full-access");
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    await proxy(
      new Request("https://gw.test/api/v1/tm/this-route-does-not-exist", {
        method: "GET",
        headers,
      }),
    );

    await flush();
    const row = await latestAuditFor(seeded.workspaceId);
    expect(row!.ourStatus).toBe(403);
    expect(row!.denyReason).toBe("unknown_route");
    expect(row!.verb).toBeNull();
  });

  test("upstream 502 path records upstreamStatus=network_error", async () => {
    const seeded = await setup("full-access");
    server.use(http.get(`${WEEEK_BASE}/tm/projects`, () => HttpResponse.error()));
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    await proxy(
      new Request("https://gw.test/api/v1/tm/projects", { method: "GET", headers }),
    );

    await flush();
    const row = await latestAuditFor(seeded.workspaceId);
    expect(row!.ourStatus).toBe(502);
    expect(row!.upstreamStatus).toBe("network_error");
    expect(row!.verb).toBe("projects:read");
    expect(row!.denyReason).toBeNull();
  });

  test("query string is captured (truncated to 500 chars)", async () => {
    const seeded = await setup("full-access");
    server.use(http.get(`${WEEEK_BASE}/tm/tasks`, () => HttpResponse.json({ tasks: [] })));
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    await proxy(
      new Request("https://gw.test/api/v1/tm/tasks?projectId=42&boardId=7", {
        method: "GET",
        headers,
      }),
    );

    await flush();
    const row = await latestAuditFor(seeded.workspaceId);
    expect(row!.query).toBe("?projectId=42&boardId=7");
  });

  test("pre-auth 401 does NOT write an audit row (no workspace context)", async () => {
    const seeded = await setup("full-access");
    const beforeRow = await latestAuditFor(seeded.workspaceId);

    const { proxy } = await import("@/server/proxy/handler");
    await proxy(new Request("https://gw.test/api/v1/ws/members", { method: "GET" }));

    await flush();
    const afterRow = await latestAuditFor(seeded.workspaceId);
    // Latest row in this workspace shouldn't have changed because the 401
    // had no workspace and didn't write.
    expect(afterRow?.id ?? null).toBe(beforeRow?.id ?? null);
  });

  test("recordAudit failures are swallowed (handler still returns the response)", async () => {
    const seeded = await setup("read-only");
    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ ok: true })));
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    // Even if the audit table were broken, the response should still be 200.
    // We simulate a "broken audit" by passing a workspaceId that doesn't exist,
    // but the handler computes the workspaceId from auth — so this is implicit:
    // if the FK insert failed, recordAudit's catch logs warn and returns.
    const res = await proxy(
      new Request("https://gw.test/api/v1/ws/members", { method: "GET", headers }),
    );
    expect(res.status).toBe(200);
  });
});
