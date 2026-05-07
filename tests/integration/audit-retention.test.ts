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
  process.env.CRON_SECRET = "test-cron-secret-32bytes-padding-xx";
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function setupRows(opts: { ageDaysOld: number[]; ageDaysFresh: number[] }) {
  const uid = `retention-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const { db } = await import("@/server/db/client");
  const { user } = await import("@/server/db/schema/auth");
  const { auditLog } = await import("@/server/db/schema/auditLog");
  const { createId } = await import("@paralleldrive/cuid2");
  await db
    .insert(user)
    .values({ id: uid, name: uid, email: `${uid}@x.test`, emailVerified: true })
    .onConflictDoNothing();
  server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ ok: true })));
  const { appRouter } = await import("@/server/trpc/routers");
  const caller = appRouter.createCaller({
    session: {
      user: { id: uid, email: `${uid}@x.test`, name: uid },
      session: { id: `s-${uid}`, token: `t-${uid}` },
    } as never,
    headers: new Headers(),
  });
  const ws = await caller.workspace.import({
    name: "retention ws",
    masterKey: `wk_ret_${uid}_aaaaaaaaaaaaaaaa`,
  });
  const sk = await caller.subKey.create({
    workspaceId: ws.id,
    label: "k",
    preset: "read-only",
  });

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  for (const age of opts.ageDaysOld) {
    await db.insert(auditLog).values({
      id: createId(),
      workspaceId: ws.id,
      subKeyId: sk.subKey.id,
      requestId: createId(),
      method: "GET",
      path: "/old",
      query: null,
      ourStatus: 200,
      upstreamStatus: "200",
      latencyMs: 1,
      verb: null,
      denyReason: null,
      ipHash: null,
      userAgent: null,
      createdAt: new Date(now - age * day),
    });
  }
  for (const age of opts.ageDaysFresh) {
    await db.insert(auditLog).values({
      id: createId(),
      workspaceId: ws.id,
      subKeyId: sk.subKey.id,
      requestId: createId(),
      method: "GET",
      path: "/fresh",
      query: null,
      ourStatus: 200,
      upstreamStatus: "200",
      latencyMs: 1,
      verb: null,
      denyReason: null,
      ipHash: null,
      userAgent: null,
      createdAt: new Date(now - age * day),
    });
  }
  return { workspaceId: ws.id };
}

async function countRows(workspaceId: string): Promise<number> {
  const { db } = await import("@/server/db/client");
  const { auditLog } = await import("@/server/db/schema/auditLog");
  const { eq, count: countFn } = await import("drizzle-orm");
  const [row] = await db
    .select({ c: countFn() })
    .from(auditLog)
    .where(eq(auditLog.workspaceId, workspaceId));
  return Number(row?.c ?? 0);
}

describe("purgeAuditOlderThan", () => {
  test("deletes rows older than the retention window; preserves fresh", async () => {
    const seeded = await setupRows({
      ageDaysOld: [120, 100, 95],
      ageDaysFresh: [1, 30, 89],
    });
    const before = await countRows(seeded.workspaceId);
    expect(before).toBeGreaterThanOrEqual(6);

    const { purgeAuditOlderThan } = await import("@/server/proxy/auditRetention");
    const result = await purgeAuditOlderThan(90);
    expect(result.deleted).toBeGreaterThanOrEqual(3);
    expect(result.retentionDays).toBe(90);

    const after = await countRows(seeded.workspaceId);
    expect(after).toBe(before - result.deleted);
  });

  test("idempotent — second call deletes 0", async () => {
    const seeded = await setupRows({ ageDaysOld: [200], ageDaysFresh: [1] });
    const { purgeAuditOlderThan } = await import("@/server/proxy/auditRetention");
    const r1 = await purgeAuditOlderThan(90);
    expect(r1.deleted).toBeGreaterThanOrEqual(1);
    const r2 = await purgeAuditOlderThan(90);
    expect(r2.deleted).toBe(0);
    const remaining = await countRows(seeded.workspaceId);
    expect(remaining).toBeGreaterThanOrEqual(1);
  });
});

describe("/api/cron/audit-retention", () => {
  test("401 when no Authorization header", async () => {
    const mod = await import("@/app/api/cron/audit-retention/route");
    const res = await mod.GET(new Request("https://gw.test/api/cron/audit-retention"));
    expect(res.status).toBe(401);
  });

  test("401 when bearer mismatches", async () => {
    const mod = await import("@/app/api/cron/audit-retention/route");
    const res = await mod.GET(
      new Request("https://gw.test/api/cron/audit-retention", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );
    expect(res.status).toBe(401);
  });

  test("200 with deletion count when bearer matches", async () => {
    await setupRows({ ageDaysOld: [200, 150], ageDaysFresh: [1] });
    const mod = await import("@/app/api/cron/audit-retention/route");
    const res = await mod.POST(
      new Request("https://gw.test/api/cron/audit-retention", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      retentionDays: number;
      cutoff: string;
      deleted: number;
    };
    expect(body.ok).toBe(true);
    expect(body.retentionDays).toBeGreaterThan(0);
    expect(typeof body.cutoff).toBe("string");
    expect(body.deleted).toBeGreaterThanOrEqual(2);
  });
});
