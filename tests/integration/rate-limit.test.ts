import { afterEach, beforeAll, describe, expect, test } from "vitest";

beforeAll(() => {
  // Migrations + DB are set up by tests/setup.ts.
});

afterEach(async () => {
  const { _resetRateLimitsForTests } = await import("@/server/proxy/rateLimit");
  await _resetRateLimitsForTests();
});

describe("checkAndIncrement", () => {
  test("first request returns allowed=true with count=1", async () => {
    const { checkAndIncrement } = await import("@/server/proxy/rateLimit");
    const out = await checkAndIncrement("ip:test1", 5);
    expect(out.allowed).toBe(true);
    expect(out.count).toBe(1);
    expect(out.remaining).toBe(4);
    expect(out.retryAfterSec).toBeGreaterThan(0);
    expect(out.retryAfterSec).toBeLessThanOrEqual(60);
  });

  test("increments under limit", async () => {
    const { checkAndIncrement } = await import("@/server/proxy/rateLimit");
    const a = await checkAndIncrement("ip:test2", 5);
    const b = await checkAndIncrement("ip:test2", 5);
    const c = await checkAndIncrement("ip:test2", 5);
    expect(a.count).toBe(1);
    expect(b.count).toBe(2);
    expect(c.count).toBe(3);
    expect(c.allowed).toBe(true);
    expect(c.remaining).toBe(2);
  });

  test("blocks when count exceeds limit", async () => {
    const { checkAndIncrement } = await import("@/server/proxy/rateLimit");
    let last: Awaited<ReturnType<typeof checkAndIncrement>> | undefined;
    for (let i = 0; i < 6; i++) {
      last = await checkAndIncrement("ip:test3", 5);
    }
    expect(last?.allowed).toBe(false);
    expect(last?.count).toBe(6);
    expect(last?.retryAfterSec).toBeGreaterThan(0);
  });

  test("isolates across bucket keys", async () => {
    const { checkAndIncrement } = await import("@/server/proxy/rateLimit");
    const a = await checkAndIncrement("ip:isoA", 2);
    const b = await checkAndIncrement("ip:isoB", 2);
    expect(a.count).toBe(1);
    expect(b.count).toBe(1);
  });

  test("rolls window forward after staleness", async () => {
    const { checkAndIncrement } = await import("@/server/proxy/rateLimit");
    // Manually plant a stale row (>60s ago) and confirm next call resets to 1.
    const { db } = await import("@/server/db/client");
    const { rateLimitBucket } = await import("@/server/db/schema/rateLimit");
    await db.insert(rateLimitBucket).values({
      bucketKey: "ip:stale",
      windowStart: new Date(Date.now() - 120_000), // 2 minutes ago
      count: 999,
    });
    const out = await checkAndIncrement("ip:stale", 5);
    expect(out.count).toBe(1);
    expect(out.allowed).toBe(true);
  });

  test("bucket key helpers prefix consistently", async () => {
    const { ipBucketKey, subKeyBucketKey } = await import("@/server/proxy/rateLimit");
    expect(ipBucketKey("deadbeef")).toBe("ip:deadbeef");
    expect(subKeyBucketKey("sk_abc")).toBe("subkey:sk_abc");
  });
});
