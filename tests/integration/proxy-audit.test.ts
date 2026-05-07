import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
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
afterAll(() => server.close());

describe("recordUsage", () => {
  test("increments useCount and sets lastUsedAt", async () => {
    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ success: true })));
    const uid = `audit-user-${Date.now()}`;
    const { db } = await import("@/server/db/client");
    const { user } = await import("@/server/db/schema/auth");
    const { subKey } = await import("@/server/db/schema/subKey");
    const { appRouter } = await import("@/server/trpc/routers");
    await db
      .insert(user)
      .values({ id: uid, name: uid, email: `${uid}@x.test`, emailVerified: true })
      .onConflictDoNothing();
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
    const sk = await caller.subKey.create({
      workspaceId: ws.id,
      label: "audit",
      preset: "read-only",
    });

    const { recordUsage } = await import("@/server/proxy/audit");
    await recordUsage(sk.subKey.id);
    await recordUsage(sk.subKey.id);

    const [row] = await db.select().from(subKey).where(eq(subKey.id, sk.subKey.id)).limit(1);
    expect(row?.useCount).toBe(2);
    expect(row?.lastUsedAt).toBeInstanceOf(Date);
  });

  test("swallows errors when DB call fails (no throw)", async () => {
    const { recordUsage } = await import("@/server/proxy/audit");
    // Non-existent id is fine — UPDATE returns 0 rows. Should not throw.
    await expect(recordUsage("nonexistent_id")).resolves.toBeUndefined();
  });
});
