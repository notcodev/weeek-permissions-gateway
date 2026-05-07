import { randomBytes } from "node:crypto";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const WEEEK_BASE = "https://weeek.test/public/v1";
const server = setupServer();

beforeAll(() => {
  process.env.MASTER_KEY_ENC_KEY ||= randomBytes(32).toString("base64");
  process.env.FINGERPRINT_HMAC_PEPPER ||= randomBytes(32).toString("base64");
  process.env.SUB_KEY_HMAC_PEPPER ||= randomBytes(32).toString("base64");
  process.env.WEEEK_API_BASE = WEEEK_BASE;
  server.listen({ onUnhandledRequest: "warn" });
});
afterEach(async () => {
  server.resetHandlers();
  const { _resetRateLimitsForTests } = await import("@/server/proxy/rateLimit");
  await _resetRateLimitsForTests();
});

async function setup() {
  const uid = `rl-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const { db } = await import("@/server/db/client");
  const { user } = await import("@/server/db/schema/auth");
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
    name: "rl ws",
    masterKey: `wk_rl_${uid}_aaaaaaaaaaaaaaaa`,
  });
  const sk = await caller.subKey.create({ workspaceId: ws.id, label: "k", preset: "read-only" });
  return { uid, workspaceId: ws.id, rawKey: sk.rawKey, subKeyId: sk.subKey.id };
}

describe("proxy rate limiting", () => {
  test("429 with Retry-After when IP exceeds 60 req/min", async () => {
    const seeded = await setup();
    const { _resetRateLimitsForTests, checkAndIncrement, ipBucketKey } = await import(
      "@/server/proxy/rateLimit"
    );
    await _resetRateLimitsForTests();
    // Seed the IP bucket near the cap to keep the test fast (60 sequential
    // proxy calls would be slow; this exercises the same code path).
    const { hashClientIp } = await import("@/server/proxy/audit");
    const { Buffer } = await import("node:buffer");
    const hash = hashClientIp("203.0.113.7");
    if (!hash) throw new Error("expected hash");
    const ipKey = ipBucketKey(Buffer.from(hash).toString("hex"));
    for (let i = 0; i < 60; i++) {
      await checkAndIncrement(ipKey, 60);
    }

    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ ok: true })));
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    headers.set("x-forwarded-for", "203.0.113.7");
    const res = await proxy(
      new Request("https://gw.test/api/v1/ws/members", { method: "GET", headers }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).not.toBeNull();
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("rate_limited");
  });

  test("429 with Retry-After when sub-key exceeds 600 req/min", async () => {
    const seeded = await setup();
    const { _resetRateLimitsForTests, checkAndIncrement, subKeyBucketKey } = await import(
      "@/server/proxy/rateLimit"
    );
    await _resetRateLimitsForTests();
    const skKey = subKeyBucketKey(seeded.subKeyId);
    for (let i = 0; i < 600; i++) {
      await checkAndIncrement(skKey, 600);
    }

    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ ok: true })));
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    // No x-forwarded-for so we don't blow the IP bucket inadvertently.
    const res = await proxy(
      new Request("https://gw.test/api/v1/ws/members", { method: "GET", headers }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).not.toBeNull();
    const body = (await res.json()) as { error: { code: string; subKeyId: string } };
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.subKeyId).toBe(seeded.subKeyId.slice(0, 8));
  });

  test("normal traffic is not rate-limited", async () => {
    const seeded = await setup();
    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ ok: true })));
    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    headers.set("x-forwarded-for", "203.0.113.99");
    for (let i = 0; i < 5; i++) {
      const res = await proxy(
        new Request("https://gw.test/api/v1/ws/members", { method: "GET", headers }),
      );
      expect(res.status).toBe(200);
    }
  });

  test("rate limit hit logs an audit row with denyReason=rate_limited", async () => {
    const seeded = await setup();
    const { _resetRateLimitsForTests, checkAndIncrement, subKeyBucketKey } = await import(
      "@/server/proxy/rateLimit"
    );
    await _resetRateLimitsForTests();
    const skKey = subKeyBucketKey(seeded.subKeyId);
    for (let i = 0; i < 600; i++) {
      await checkAndIncrement(skKey, 600);
    }

    const { proxy } = await import("@/server/proxy/handler");
    const headers = new Headers();
    headers.set("authorization", `Bearer ${seeded.rawKey}`);
    await proxy(
      new Request("https://gw.test/api/v1/ws/members", { method: "GET", headers }),
    );

    // Wait for fire-and-forget audit insert.
    await new Promise((r) => setTimeout(r, 200));
    const { db } = await import("@/server/db/client");
    const { auditLog } = await import("@/server/db/schema/auditLog");
    const { desc, eq } = await import("drizzle-orm");
    const [row] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.workspaceId, seeded.workspaceId))
      .orderBy(desc(auditLog.createdAt))
      .limit(1);
    expect(row?.denyReason).toBe("rate_limited");
    expect(row?.ourStatus).toBe(429);
  });
});
