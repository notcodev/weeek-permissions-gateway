import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

beforeAll(() => {
  process.env.MASTER_KEY_ENC_KEY ||= randomBytes(32).toString("base64");
  process.env.FINGERPRINT_HMAC_PEPPER ||= randomBytes(32).toString("base64");
  process.env.SUB_KEY_HMAC_PEPPER ||= randomBytes(32).toString("base64");
});
afterAll(() => {});

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

async function seedUser(uid: string) {
  const { db } = await import("@/server/db/client");
  const { user } = await import("@/server/db/schema/auth");
  await db
    .insert(user)
    .values({ id: uid, name: uid, email: `${uid}@x.test`, emailVerified: true })
    .onConflictDoNothing();
}

async function seedOrgWithMember(opts: { ownerUid: string; orgName: string; orgSlug: string; role?: string }) {
  const { db } = await import("@/server/db/client");
  const { organization, member } = await import("@/server/db/schema/org");
  const { createId } = await import("@paralleldrive/cuid2");
  const orgId = createId();
  await db.insert(organization).values({
    id: orgId,
    name: opts.orgName,
    slug: opts.orgSlug,
  });
  await db.insert(member).values({
    id: createId(),
    userId: opts.ownerUid,
    organizationId: orgId,
    role: opts.role ?? "owner",
  });
  return { orgId };
}

describe("org.list", () => {
  test("returns the orgs the user is a member of, ordered by name", async () => {
    const uid = `org-list-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    await seedUser(uid);
    await seedOrgWithMember({ ownerUid: uid, orgName: "Zeta Co", orgSlug: `${uid}-z` });
    await seedOrgWithMember({ ownerUid: uid, orgName: "Alpha Co", orgSlug: `${uid}-a` });
    const caller = await makeCaller(uid);
    const out = await caller.org.list();
    const myOrgs = out.filter((o) => o.slug.startsWith(uid));
    expect(myOrgs.map((o) => o.name)).toEqual(["Alpha Co", "Zeta Co"]);
    expect(myOrgs[0]?.role).toBe("owner");
  });

  test("isolates orgs across users", async () => {
    const uidA = `org-iso-a-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const uidB = `org-iso-b-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    await seedUser(uidA);
    await seedUser(uidB);
    await seedOrgWithMember({ ownerUid: uidA, orgName: "A's Org", orgSlug: `${uidA}-only` });

    const callerB = await makeCaller(uidB);
    const out = await callerB.org.list();
    expect(out.find((o) => o.slug === `${uidA}-only`)).toBeUndefined();
  });

  test("empty when user has no memberships", async () => {
    const uid = `org-empty-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    await seedUser(uid);
    const caller = await makeCaller(uid);
    const out = await caller.org.list();
    expect(out).toBeInstanceOf(Array);
    // Other tests can have populated rows; just assert the user has no own ones.
    expect(out.find((o) => o.slug.startsWith(uid))).toBeUndefined();
  });
});

describe("org.create", () => {
  test("creates org via Better Auth API and returns id; user becomes a member", async () => {
    const uid = `org-create-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    await seedUser(uid);
    const caller = await makeCaller(uid);
    const slug = `${uid}-new`;
    const created = await caller.org.create({ name: "Brand New Co", slug });
    expect(typeof created.id).toBe("string");

    const list = await caller.org.list();
    const found = list.find((o) => o.slug === slug);
    expect(found).toBeDefined();
    expect(found?.name).toBe("Brand New Co");
    expect(found?.role).toBe("owner");
  });

  test("rejects malformed slugs", async () => {
    const uid = `org-bad-slug-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    await seedUser(uid);
    const caller = await makeCaller(uid);
    await expect(
      caller.org.create({ name: "Bad", slug: "Has Spaces" }),
    ).rejects.toThrow();
    await expect(caller.org.create({ name: "Bad", slug: "-leadingdash" })).rejects.toThrow();
    await expect(caller.org.create({ name: "Bad", slug: "x" })).rejects.toThrow();
  });
});

describe("org membership role gates", () => {
  test("removeMember rejects when caller is not owner/admin", async () => {
    const uid = `org-rm-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    await seedUser(uid);
    const seeded = await seedOrgWithMember({
      ownerUid: uid,
      orgName: "Read Only Org",
      orgSlug: `${uid}-ro`,
      role: "member",
    });
    const caller = await makeCaller(uid);
    await expect(
      caller.org.removeMember({ organizationId: seeded.orgId, memberIdOrEmail: "x@y.test" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("invite rejects when caller is not owner/admin", async () => {
    const uid = `org-inv-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    await seedUser(uid);
    const seeded = await seedOrgWithMember({
      ownerUid: uid,
      orgName: "ReadOnly2",
      orgSlug: `${uid}-ro2`,
      role: "member",
    });
    const caller = await makeCaller(uid);
    await expect(
      caller.org.invite({
        organizationId: seeded.orgId,
        email: "newperson@example.com",
        role: "member",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("removeMember NOT_FOUND for unknown org", async () => {
    const uid = `org-nf-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    await seedUser(uid);
    const caller = await makeCaller(uid);
    await expect(
      caller.org.removeMember({ organizationId: "no-such-org", memberIdOrEmail: "x@y.test" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
