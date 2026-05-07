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

async function seedUser(uid: string) {
  const { db } = await import("@/server/db/client");
  const { user } = await import("@/server/db/schema/auth");
  await db
    .insert(user)
    .values({ id: uid, name: uid, email: `${uid}@x.test`, emailVerified: true })
    .onConflictDoNothing();
}

async function seedOrgWith(opts: { uid: string; role: "owner" | "admin" | "member" }) {
  const { db } = await import("@/server/db/client");
  const { organization, member } = await import("@/server/db/schema/org");
  const { createId } = await import("@paralleldrive/cuid2");
  const orgId = createId();
  await db.insert(organization).values({ id: orgId, name: "Acme", slug: `acme-${orgId}` });
  await db
    .insert(member)
    .values({ id: createId(), userId: opts.uid, organizationId: orgId, role: opts.role });
  return orgId;
}

function makeCallerForUser(uid: string, activeOrgId?: string | null) {
  return import("@/server/trpc/routers").then(({ appRouter }) =>
    appRouter.createCaller({
      session: {
        user: { id: uid, email: `${uid}@x.test`, name: uid },
        session: {
          id: `s-${uid}`,
          token: `t-${uid}`,
          activeOrganizationId: activeOrgId ?? null,
        },
      } as never,
      headers: new Headers(),
    }),
  );
}

describe("workspace.list/import/remove honour owner context", () => {
  test("personal workspaces invisible from org context", async () => {
    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ ok: true })));
    const uid = `oc-iso-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    await seedUser(uid);
    const orgId = await seedOrgWith({ uid, role: "owner" });

    const personal = await makeCallerForUser(uid);
    const personalWs = await personal.workspace.import({
      name: "Personal WS",
      masterKey: `wk_personal_${uid}_aaaaaaaaaaaaaaaa`,
    });

    const orgCaller = await makeCallerForUser(uid, orgId);
    const orgList = await orgCaller.workspace.list();
    expect(orgList.find((w) => w.id === personalWs.id)).toBeUndefined();
  });

  test("org context import attaches workspace to the organization", async () => {
    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ ok: true })));
    const uid = `oc-attach-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    await seedUser(uid);
    const orgId = await seedOrgWith({ uid, role: "owner" });
    const orgCaller = await makeCallerForUser(uid, orgId);
    const ws = await orgCaller.workspace.import({
      name: "Org WS",
      masterKey: `wk_org_${uid}_aaaaaaaaaaaaaaaa`,
    });
    expect(ws.ownerType).toBe("organization");
    expect(ws.ownerId).toBe(orgId);
  });

  test("org member without write role is blocked from import", async () => {
    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ ok: true })));
    const uid = `oc-member-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    await seedUser(uid);
    const orgId = await seedOrgWith({ uid, role: "member" });
    const orgCaller = await makeCallerForUser(uid, orgId);
    await expect(
      orgCaller.workspace.import({
        name: "Should fail",
        masterKey: `wk_member_${uid}_aaaaaaaaaaaaaaaa`,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("stale activeOrganizationId throws FORBIDDEN", async () => {
    const uid = `oc-stale-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    await seedUser(uid);
    const caller = await makeCallerForUser(uid, "non-existent-org-id");
    await expect(caller.workspace.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("subKey.create role gate honours owner context", () => {
  test("org member is blocked from issuing sub-keys", async () => {
    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ ok: true })));
    const uid = `oc-sk-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    await seedUser(uid);
    const orgId = await seedOrgWith({ uid, role: "owner" });
    // Owner imports a workspace.
    const orgCaller = await makeCallerForUser(uid, orgId);
    const ws = await orgCaller.workspace.import({
      name: "Org WS for sk",
      masterKey: `wk_orgsk_${uid}_aaaaaaaaaaaaaaaa`,
    });
    // Demote the membership to "member" role to simulate a non-admin user.
    const { db } = await import("@/server/db/client");
    const { member } = await import("@/server/db/schema/org");
    const { eq } = await import("drizzle-orm");
    await db.update(member).set({ role: "member" }).where(eq(member.userId, uid));

    const memberCaller = await makeCallerForUser(uid, orgId);
    await expect(
      memberCaller.subKey.create({
        workspaceId: ws.id,
        label: "Should fail",
        preset: "read-only",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
