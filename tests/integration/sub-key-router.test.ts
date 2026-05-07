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

async function seedUser(userId: string, email: string) {
  const { db } = await import("@/server/db/client");
  const { user } = await import("@/server/db/schema/auth");
  await db
    .insert(user)
    .values({ id: userId, name: email, email, emailVerified: true })
    .onConflictDoNothing();
}

async function seedWorkspaceForUser(userId: string, label: string) {
  // Use the workspace router to create a real row, mirroring the production path.
  server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ success: true })));
  const { appRouter } = await import("@/server/trpc/routers");
  const caller = appRouter.createCaller({
    session: {
      user: { id: userId, email: `${userId}@example.com`, name: userId },
      session: { id: `s-${userId}`, token: `t-${userId}` },
    } as never,
    headers: new Headers(),
  });
  const created = await caller.workspace.import({
    name: label,
    masterKey: `wk_${userId}_${Date.now()}_aaaaaaaaaaaaaaaa`,
  });
  return created.id;
}

async function makeCaller(userId: string) {
  const { appRouter } = await import("@/server/trpc/routers");
  return appRouter.createCaller({
    session: {
      user: { id: userId, email: `${userId}@example.com`, name: userId },
      session: { id: `s-${userId}`, token: `t-${userId}` },
    } as never,
    headers: new Headers(),
  });
}

describe("subKey router", () => {
  test("create returns rawKey + SubKeyPublic; list omits hash and rawKey", async () => {
    const uid = `sk-user-${Date.now()}-1`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS for create");
    const caller = await makeCaller(uid);

    const created = await caller.subKey.create({
      workspaceId: wsId,
      label: "CI bot",
      preset: "read-only",
    });
    expect(created.rawKey.startsWith("wgw_")).toBe(true);
    expect(created.subKey.label).toBe("CI bot");
    expect(created.subKey.prefix).toBe("wgw_");
    expect(created.subKey.last4.length).toBe(4);
    expect(created.subKey.status).toBe("active");
    expect(created.subKey.scopeProjects).toEqual(["*"]);
    expect(created.subKey.scopeBoards).toEqual(["*"]);
    expect(created.subKey.verbs).toContain("tasks:read");
    expect(created.subKey.verbs).not.toContain("tasks:write");

    expect((created.subKey as Record<string, unknown>).hash).toBeUndefined();

    const list = await caller.subKey.listForWorkspace({ workspaceId: wsId });
    const found = list.find((k) => k.id === created.subKey.id);
    expect(found?.label).toBe("CI bot");
    expect((found as Record<string, unknown>).rawKey).toBeUndefined();
    expect((found as Record<string, unknown>).hash).toBeUndefined();
  });

  test("create with full-access preset expands to the full verb catalogue", async () => {
    const uid = `sk-user-${Date.now()}-2`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS for full-access");
    const caller = await makeCaller(uid);

    const created = await caller.subKey.create({
      workspaceId: wsId,
      label: "Admin",
      preset: "full-access",
    });
    const { VERB_CATALOG } = await import("@/server/verbs");
    expect([...created.subKey.verbs].sort()).toEqual([...VERB_CATALOG].sort());
  });

  test("hash is stored as HMAC-SHA256(rawKey, SUB_KEY_HMAC_PEPPER)", async () => {
    const uid = `sk-user-${Date.now()}-3`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS for hash check");
    const caller = await makeCaller(uid);

    const created = await caller.subKey.create({
      workspaceId: wsId,
      label: "Hash verify",
      preset: "read-only",
    });
    const { db } = await import("@/server/db/client");
    const { subKey } = await import("@/server/db/schema/subKey");
    const { hashSubKey } = await import("@/server/crypto/subKey");

    const [row] = await db.select().from(subKey).where(eq(subKey.id, created.subKey.id)).limit(1);
    if (!row) throw new Error("row not found");
    expect(Buffer.from(row.hash).equals(Buffer.from(hashSubKey(created.rawKey)))).toBe(true);
  });

  test("create rejects with NOT_FOUND for someone else's workspace", async () => {
    const uidA = `sk-user-${Date.now()}-4a`;
    const uidB = `sk-user-${Date.now()}-4b`;
    await seedUser(uidA, `${uidA}@example.com`);
    await seedUser(uidB, `${uidB}@example.com`);
    const wsAId = await seedWorkspaceForUser(uidA, "A's WS");
    const callerB = await makeCaller(uidB);

    await expect(
      callerB.subKey.create({ workspaceId: wsAId, label: "Steal", preset: "read-only" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("listForWorkspace isolates by owner", async () => {
    const uidA = `sk-user-${Date.now()}-5a`;
    const uidB = `sk-user-${Date.now()}-5b`;
    await seedUser(uidA, `${uidA}@example.com`);
    await seedUser(uidB, `${uidB}@example.com`);
    const wsAId = await seedWorkspaceForUser(uidA, "A's WS isolate");
    const callerA = await makeCaller(uidA);
    const callerB = await makeCaller(uidB);

    await callerA.subKey.create({ workspaceId: wsAId, label: "A's key", preset: "read-only" });
    await expect(callerB.subKey.listForWorkspace({ workspaceId: wsAId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("revoke flips status to 'revoked' and is idempotent", async () => {
    const uid = `sk-user-${Date.now()}-6`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS for revoke");
    const caller = await makeCaller(uid);

    const created = await caller.subKey.create({
      workspaceId: wsId,
      label: "Revoke me",
      preset: "task-automator",
    });
    const first = await caller.subKey.revoke({ id: created.subKey.id });
    expect(first.ok).toBe(true);
    const second = await caller.subKey.revoke({ id: created.subKey.id });
    expect(second.ok).toBe(true);

    const fetched = await caller.subKey.get({ id: created.subKey.id });
    expect(fetched.status).toBe("revoked");
    expect(fetched.revokedAt).toBeInstanceOf(Date);
    expect(fetched.revokedByUserId).toBe(uid);
  });

  test("revoke returns NOT_FOUND for someone else's sub-key", async () => {
    const uidA = `sk-user-${Date.now()}-7a`;
    const uidB = `sk-user-${Date.now()}-7b`;
    await seedUser(uidA, `${uidA}@example.com`);
    await seedUser(uidB, `${uidB}@example.com`);
    const wsAId = await seedWorkspaceForUser(uidA, "A's WS revoke isolate");
    const callerA = await makeCaller(uidA);
    const callerB = await makeCaller(uidB);

    const created = await callerA.subKey.create({
      workspaceId: wsAId,
      label: "A's key",
      preset: "read-only",
    });
    await expect(callerB.subKey.revoke({ id: created.subKey.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("workspace removal cascades sub-keys", async () => {
    const uid = `sk-user-${Date.now()}-8`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS for cascade");
    const caller = await makeCaller(uid);

    const created = await caller.subKey.create({
      workspaceId: wsId,
      label: "Cascade me",
      preset: "read-only",
    });

    await caller.workspace.remove({ id: wsId });

    const { db } = await import("@/server/db/client");
    const { subKey } = await import("@/server/db/schema/subKey");
    const remaining = await db.select().from(subKey).where(eq(subKey.id, created.subKey.id));
    expect(remaining).toHaveLength(0);
  });

  test("get returns SubKeyPublic without hash for the owner", async () => {
    const uid = `sk-user-${Date.now()}-9`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS for get");
    const caller = await makeCaller(uid);

    const created = await caller.subKey.create({
      workspaceId: wsId,
      label: "Gettable",
      preset: "read-only",
    });
    const got = await caller.subKey.get({ id: created.subKey.id });
    expect(got.id).toBe(created.subKey.id);
    expect(got.label).toBe("Gettable");
    expect((got as Record<string, unknown>).hash).toBeUndefined();
    expect((got as Record<string, unknown>).rawKey).toBeUndefined();
  });

  test("create with explicit scopeProjects/scopeBoards persists them", async () => {
    const uid = `sk-user-${Date.now()}-scope`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS scope");
    const caller = await makeCaller(uid);
    const created = await caller.subKey.create({
      workspaceId: wsId,
      label: "scoped",
      preset: "read-only",
      scopeProjects: ["p1", "p2"],
      scopeBoards: ["b1"],
    });
    expect(created.subKey.scopeProjects).toEqual(["p1", "p2"]);
    expect(created.subKey.scopeBoards).toEqual(["b1"]);
  });

  test("create defaults scope to ['*'] when omitted (backwards-compat)", async () => {
    const uid = `sk-user-${Date.now()}-scope-default`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS scope default");
    const caller = await makeCaller(uid);
    const created = await caller.subKey.create({
      workspaceId: wsId,
      label: "no scope",
      preset: "read-only",
    });
    expect(created.subKey.scopeProjects).toEqual(["*"]);
    expect(created.subKey.scopeBoards).toEqual(["*"]);
  });

  test("create rejects empty scopeProjects array", async () => {
    const uid = `sk-user-${Date.now()}-scope-empty`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS scope empty");
    const caller = await makeCaller(uid);
    await expect(
      caller.subKey.create({
        workspaceId: wsId,
        label: "empty",
        preset: "read-only",
        scopeProjects: [],
        scopeBoards: ["*"],
      }),
    ).rejects.toThrow();
  });

  test("create rejects empty scopeBoards array", async () => {
    const uid = `sk-user-${Date.now()}-scope-empty-b`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS scope empty b");
    const caller = await makeCaller(uid);
    await expect(
      caller.subKey.create({
        workspaceId: wsId,
        label: "empty b",
        preset: "read-only",
        scopeProjects: ["*"],
        scopeBoards: [],
      }),
    ).rejects.toThrow();
  });

  test("create with binding fields persists boundWeeekUserId/Name + flags", async () => {
    const uid = `sk-user-${Date.now()}-bind`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS bind");
    const caller = await makeCaller(uid);
    const created = await caller.subKey.create({
      workspaceId: wsId,
      label: "bound",
      preset: "task-automator",
      boundWeeekUserId: "u-42",
      boundWeeekUserName: "Alice",
      visibilityBound: true,
      authorRewrite: true,
    });
    expect(created.subKey.boundWeeekUserId).toBe("u-42");
    expect(created.subKey.boundWeeekUserName).toBe("Alice");
    expect(created.subKey.visibilityBound).toBe(true);
    expect(created.subKey.authorRewrite).toBe(true);
  });

  test("create defaults binding fields to null/false when omitted", async () => {
    const uid = `sk-user-${Date.now()}-bind-default`;
    await seedUser(uid, `${uid}@example.com`);
    const wsId = await seedWorkspaceForUser(uid, "WS bind default");
    const caller = await makeCaller(uid);
    const created = await caller.subKey.create({
      workspaceId: wsId,
      label: "no bind",
      preset: "read-only",
    });
    expect(created.subKey.boundWeeekUserId).toBeNull();
    expect(created.subKey.boundWeeekUserName).toBeNull();
    expect(created.subKey.visibilityBound).toBe(false);
    expect(created.subKey.authorRewrite).toBe(false);
  });
});
