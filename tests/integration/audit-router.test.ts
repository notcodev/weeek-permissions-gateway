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

async function makeCaller(uid: string) {
  const { appRouter } = await import("@/server/trpc/routers");
  return appRouter.createCaller({
    session: {
      user: { id: uid, email: `${uid}@x.test`, name: uid },
      session: { id: `s-${uid}`, token: `t-${uid}` },
    } as never,
    headers: new Headers(),
  });
}

async function setupWorkspace() {
  const uid = `audit-rt-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const { db } = await import("@/server/db/client");
  const { user } = await import("@/server/db/schema/auth");
  await db
    .insert(user)
    .values({ id: uid, name: uid, email: `${uid}@x.test`, emailVerified: true })
    .onConflictDoNothing();
  server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ ok: true })));
  const caller = await makeCaller(uid);
  const ws = await caller.workspace.import({
    name: "audit ws",
    masterKey: `wk_audit_rt_${uid}_aaaaaaaaaaaaaaaa`,
  });
  const sk = await caller.subKey.create({ workspaceId: ws.id, label: "k", preset: "full-access" });
  return { uid, caller, workspaceId: ws.id, subKeyId: sk.subKey.id, rawKey: sk.rawKey };
}

async function emitAuditRows(
  workspaceId: string,
  subKeyId: string,
  rows: Array<{
    method?: string;
    path?: string;
    ourStatus: number;
    upstreamStatus?: string;
    latencyMs: number;
    verb?: string | null;
    denyReason?: string | null;
    createdAt?: Date;
  }>,
) {
  const { db } = await import("@/server/db/client");
  const { auditLog } = await import("@/server/db/schema/auditLog");
  const { createId } = await import("@paralleldrive/cuid2");
  for (const r of rows) {
    await db.insert(auditLog).values({
      id: createId(),
      workspaceId,
      subKeyId,
      requestId: createId(),
      method: r.method ?? "GET",
      path: r.path ?? "/ws/members",
      query: null,
      ourStatus: r.ourStatus,
      upstreamStatus: r.upstreamStatus ?? "200",
      latencyMs: r.latencyMs,
      verb: r.verb === undefined ? "members:read" : r.verb,
      denyReason: r.denyReason ?? null,
      ipHash: null,
      userAgent: null,
      createdAt: r.createdAt ?? new Date(),
    });
  }
}

describe("audit.search", () => {
  test("returns rows for the owner; isolates by workspace", async () => {
    const a = await setupWorkspace();
    const b = await setupWorkspace();
    await emitAuditRows(a.workspaceId, a.subKeyId, [{ ourStatus: 200, latencyMs: 5 }]);
    await emitAuditRows(b.workspaceId, b.subKeyId, [{ ourStatus: 200, latencyMs: 6 }]);

    const out = await a.caller.audit.search({ workspaceId: a.workspaceId });
    expect(out.items.length).toBeGreaterThanOrEqual(1);
    for (const it of out.items) {
      expect(it.workspaceId).toBe(a.workspaceId);
    }
  });

  test("NOT_FOUND for someone else's workspace", async () => {
    const a = await setupWorkspace();
    const b = await setupWorkspace();
    await expect(
      b.caller.audit.search({ workspaceId: a.workspaceId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("denyReason filter narrows to deny rows", async () => {
    const a = await setupWorkspace();
    await emitAuditRows(a.workspaceId, a.subKeyId, [
      { ourStatus: 200, latencyMs: 5, denyReason: null },
      { ourStatus: 403, latencyMs: 4, denyReason: "verb_missing" },
      { ourStatus: 403, latencyMs: 3, denyReason: "unknown_route" },
    ]);
    const out = await a.caller.audit.search({
      workspaceId: a.workspaceId,
      denyReason: "verb_missing",
    });
    expect(out.items.every((i) => i.denyReason === "verb_missing")).toBe(true);
    expect(out.items.length).toBeGreaterThanOrEqual(1);
  });

  test("status range filter", async () => {
    const a = await setupWorkspace();
    await emitAuditRows(a.workspaceId, a.subKeyId, [
      { ourStatus: 200, latencyMs: 5 },
      { ourStatus: 403, latencyMs: 4, denyReason: "verb_missing" },
      { ourStatus: 502, latencyMs: 5, upstreamStatus: "network_error" },
    ]);
    const out = await a.caller.audit.search({
      workspaceId: a.workspaceId,
      statusMin: 500,
      statusMax: 599,
    });
    expect(out.items.every((i) => i.ourStatus >= 500)).toBe(true);
    expect(out.items.length).toBeGreaterThanOrEqual(1);
  });

  test("pathContains filter (case-insensitive)", async () => {
    const a = await setupWorkspace();
    await emitAuditRows(a.workspaceId, a.subKeyId, [
      { ourStatus: 200, latencyMs: 5, path: "/tm/projects" },
      { ourStatus: 200, latencyMs: 5, path: "/tm/tasks" },
      { ourStatus: 200, latencyMs: 5, path: "/ws/members" },
    ]);
    const out = await a.caller.audit.search({
      workspaceId: a.workspaceId,
      pathContains: "TASKS",
    });
    expect(out.items.every((i) => i.path.toLowerCase().includes("tasks"))).toBe(true);
    expect(out.items.length).toBeGreaterThanOrEqual(1);
  });

  test("from/to filter excludes outside range", async () => {
    const a = await setupWorkspace();
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await emitAuditRows(a.workspaceId, a.subKeyId, [
      { ourStatus: 200, latencyMs: 5, createdAt: longAgo },
      { ourStatus: 200, latencyMs: 5 },
    ]);
    const out = await a.caller.audit.search({
      workspaceId: a.workspaceId,
      from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
    for (const it of out.items) {
      expect(it.createdAt.getTime()).toBeGreaterThan(Date.now() - 24 * 60 * 60 * 1000 - 1000);
    }
  });

  test("cursor pagination returns nextCursor when more rows exist", async () => {
    const a = await setupWorkspace();
    const baseTime = Date.now();
    const rows = Array.from({ length: 5 }, (_, i) => ({
      ourStatus: 200,
      latencyMs: 1,
      createdAt: new Date(baseTime - i * 1000),
    }));
    await emitAuditRows(a.workspaceId, a.subKeyId, rows);

    const page1 = await a.caller.audit.search({
      workspaceId: a.workspaceId,
      limit: 2,
    });
    expect(page1.items.length).toBe(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await a.caller.audit.search({
      workspaceId: a.workspaceId,
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items.length).toBeGreaterThanOrEqual(1);
    // No overlap between pages.
    const firstIds = new Set(page1.items.map((i) => i.id));
    for (const i of page2.items) {
      expect(firstIds.has(i.id)).toBe(false);
    }
  });

  test("public shape strips ipHash bytes; surfaces hasIpHash boolean", async () => {
    const a = await setupWorkspace();
    await emitAuditRows(a.workspaceId, a.subKeyId, [{ ourStatus: 200, latencyMs: 5 }]);
    const out = await a.caller.audit.search({ workspaceId: a.workspaceId });
    const sample = out.items[0]!;
    expect(sample).not.toHaveProperty("ipHash");
    expect(typeof sample.hasIpHash).toBe("boolean");
  });
});

describe("audit.stats", () => {
  test("returns total + status buckets + denyBreakdown + latency p50/p95", async () => {
    const a = await setupWorkspace();
    await emitAuditRows(a.workspaceId, a.subKeyId, [
      { ourStatus: 200, latencyMs: 10 },
      { ourStatus: 200, latencyMs: 20 },
      { ourStatus: 200, latencyMs: 30 },
      { ourStatus: 403, latencyMs: 5, denyReason: "verb_missing" },
      { ourStatus: 403, latencyMs: 5, denyReason: "verb_missing" },
      { ourStatus: 403, latencyMs: 5, denyReason: "unknown_route" },
      { ourStatus: 502, latencyMs: 100, upstreamStatus: "network_error" },
    ]);
    const out = await a.caller.audit.stats({ workspaceId: a.workspaceId });
    expect(out.total).toBeGreaterThanOrEqual(7);
    expect(out.statusBuckets["2xx"]).toBeGreaterThanOrEqual(3);
    expect(out.statusBuckets["4xx"]).toBeGreaterThanOrEqual(3);
    expect(out.statusBuckets["5xx"]).toBeGreaterThanOrEqual(1);
    expect(out.denyBreakdown.verb_missing).toBeGreaterThanOrEqual(2);
    expect(out.denyBreakdown.unknown_route).toBeGreaterThanOrEqual(1);
    expect(out.latencyMs.p50).not.toBeNull();
    expect(out.latencyMs.p95).not.toBeNull();
    if (out.latencyMs.p50 != null && out.latencyMs.p95 != null) {
      expect(out.latencyMs.p95).toBeGreaterThanOrEqual(out.latencyMs.p50);
    }
  });

  test("empty workspace → total 0; latency null", async () => {
    const a = await setupWorkspace();
    // Cap to a 1-second window centered on now; the create rows from setup are already older.
    const out = await a.caller.audit.stats({
      workspaceId: a.workspaceId,
      from: new Date(Date.now() + 60_000).toISOString(),
      to: new Date(Date.now() + 120_000).toISOString(),
    });
    expect(out.total).toBe(0);
    expect(out.latencyMs.p50).toBeNull();
    expect(out.latencyMs.p95).toBeNull();
  });

  test("NOT_FOUND for someone else's workspace", async () => {
    const a = await setupWorkspace();
    const b = await setupWorkspace();
    await expect(
      b.caller.audit.stats({ workspaceId: a.workspaceId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
