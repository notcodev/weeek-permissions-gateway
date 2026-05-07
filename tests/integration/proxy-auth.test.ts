import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
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
afterAll(() => server.close());

async function seedUser(userId: string) {
  const { db } = await import("@/server/db/client");
  const { user } = await import("@/server/db/schema/auth");
  await db
    .insert(user)
    .values({ id: userId, name: userId, email: `${userId}@example.com`, emailVerified: true })
    .onConflictDoNothing();
}

async function seedWorkspaceAndKey(userId: string) {
  server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ success: true })));
  const { appRouter } = await import("@/server/trpc/routers");
  const caller = appRouter.createCaller({
    session: {
      user: { id: userId, email: `${userId}@example.com`, name: userId },
      session: { id: `s-${userId}`, token: `t-${userId}` },
    } as never,
    headers: new Headers(),
  });
  const ws = await caller.workspace.import({
    name: "auth-test-ws",
    masterKey: `wk_master_for_${userId}_aaaaaaaaaaaaaaaa`,
  });
  const sk = await caller.subKey.create({
    workspaceId: ws.id,
    label: "auth test",
    preset: "read-only",
  });
  return { workspaceId: ws.id, rawKey: sk.rawKey, subKeyId: sk.subKey.id };
}

describe("authenticateBearer", () => {
  test("returns AuthedRequest for a valid active sub-key", async () => {
    const uid = `auth-user-${Date.now()}-1`;
    await seedUser(uid);
    const seeded = await seedWorkspaceAndKey(uid);
    const { authenticateBearer } = await import("@/server/proxy/auth");

    const req = new Request("https://gateway.test/api/v1/ws/members", {
      headers: { Authorization: `Bearer ${seeded.rawKey}` },
    });
    const out = await authenticateBearer(req);
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.authed.subKeyId).toBe(seeded.subKeyId);
    expect(out.authed.workspaceId).toBe(seeded.workspaceId);
    expect(out.authed.verbs).toContain("tasks:read");
    expect(out.authed.masterKey).toBe(`wk_master_for_${uid}_aaaaaaaaaaaaaaaa`);
  });

  test("returns 401 on missing bearer", async () => {
    const { authenticateBearer } = await import("@/server/proxy/auth");
    const req = new Request("https://gateway.test/api/v1/ws/members");
    const out = await authenticateBearer(req);
    expect(out.kind).toBe("err");
    if (out.kind !== "err") return;
    expect(out.code).toBe("unauthenticated");
  });

  test("returns 401 on bearer that doesn't start with wgw_", async () => {
    const { authenticateBearer } = await import("@/server/proxy/auth");
    const req = new Request("https://gateway.test/api/v1/ws/members", {
      headers: { Authorization: "Bearer not_our_prefix_xxx" },
    });
    const out = await authenticateBearer(req);
    expect(out.kind).toBe("err");
    if (out.kind !== "err") return;
    expect(out.code).toBe("unauthenticated");
  });

  test("returns 401 on unknown sub-key", async () => {
    const { authenticateBearer } = await import("@/server/proxy/auth");
    const req = new Request("https://gateway.test/api/v1/ws/members", {
      headers: { Authorization: "Bearer wgw_made_up_key_xxxxxxxxxxxxxxxxxxxxxxxx" },
    });
    const out = await authenticateBearer(req);
    expect(out.kind).toBe("err");
    if (out.kind !== "err") return;
    expect(out.code).toBe("unauthenticated");
  });

  test("returns 401 on revoked sub-key", async () => {
    const uid = `auth-user-${Date.now()}-revoke`;
    await seedUser(uid);
    const seeded = await seedWorkspaceAndKey(uid);
    const { appRouter } = await import("@/server/trpc/routers");
    const caller = appRouter.createCaller({
      session: {
        user: { id: uid, email: `${uid}@example.com`, name: uid },
        session: { id: `s-${uid}`, token: `t-${uid}` },
      } as never,
      headers: new Headers(),
    });
    await caller.subKey.revoke({ id: seeded.subKeyId });

    const { authenticateBearer } = await import("@/server/proxy/auth");
    const req = new Request("https://gateway.test/api/v1/ws/members", {
      headers: { Authorization: `Bearer ${seeded.rawKey}` },
    });
    const out = await authenticateBearer(req);
    expect(out.kind).toBe("err");
    if (out.kind !== "err") return;
    expect(out.code).toBe("unauthenticated");
  });
});
