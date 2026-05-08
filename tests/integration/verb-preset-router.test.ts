import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, test } from "vitest";

beforeAll(() => {
  process.env.MASTER_KEY_ENC_KEY ||= randomBytes(32).toString("base64");
  process.env.FINGERPRINT_HMAC_PEPPER ||= randomBytes(32).toString("base64");
  process.env.SUB_KEY_HMAC_PEPPER ||= randomBytes(32).toString("base64");
});

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

function uidFor(label: string) {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

describe("verbPreset.create + list", () => {
  test("creates a preset and shows it in list", async () => {
    const uid = uidFor("vp-cl");
    await seedUser(uid);
    const caller = await makeCaller(uid);

    const created = await caller.verbPreset.create({
      name: "My read-only",
      verbs: ["projects:read", "boards:read"],
    });
    expect(created.id).toBeTruthy();
    expect(created.ownerType).toBe("user");
    expect(created.ownerId).toBe(uid);
    expect(created.name).toBe("My read-only");
    expect(created.verbs).toEqual(["projects:read", "boards:read"]);

    const list = await caller.verbPreset.list();
    expect(list.find((p) => p.id === created.id)).toBeDefined();
  });

  test("rejects unknown verbs", async () => {
    const uid = uidFor("vp-bad-verb");
    await seedUser(uid);
    const caller = await makeCaller(uid);
    await expect(
      caller.verbPreset.create({ name: "bad", verbs: ["nope:nope"] }),
    ).rejects.toThrow();
  });

  test("rejects duplicate names per owner", async () => {
    const uid = uidFor("vp-dup");
    await seedUser(uid);
    const caller = await makeCaller(uid);
    await caller.verbPreset.create({ name: "Same", verbs: ["projects:read"] });
    await expect(
      caller.verbPreset.create({ name: "Same", verbs: ["boards:read"] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("isolates presets across users", async () => {
    const uidA = uidFor("vp-iso-a");
    const uidB = uidFor("vp-iso-b");
    await seedUser(uidA);
    await seedUser(uidB);
    const callerA = await makeCaller(uidA);
    const callerB = await makeCaller(uidB);

    await callerA.verbPreset.create({ name: "A only", verbs: ["projects:read"] });
    const bList = await callerB.verbPreset.list();
    expect(bList.find((p) => p.name === "A only")).toBeUndefined();
  });
});

describe("verbPreset.update", () => {
  test("renames + replaces verbs", async () => {
    const uid = uidFor("vp-upd");
    await seedUser(uid);
    const caller = await makeCaller(uid);
    const created = await caller.verbPreset.create({
      name: "Initial",
      verbs: ["projects:read"],
    });

    const updated = await caller.verbPreset.update({
      id: created.id,
      name: "Renamed",
      verbs: ["projects:read", "boards:read"],
    });
    expect(updated.name).toBe("Renamed");
    expect(updated.verbs).toEqual(["projects:read", "boards:read"]);
    expect(+updated.updatedAt).toBeGreaterThanOrEqual(+created.updatedAt);
  });

  test("NOT_FOUND when updating someone else's preset", async () => {
    const uidA = uidFor("vp-ux-a");
    const uidB = uidFor("vp-ux-b");
    await seedUser(uidA);
    await seedUser(uidB);
    const callerA = await makeCaller(uidA);
    const callerB = await makeCaller(uidB);
    const created = await callerA.verbPreset.create({
      name: "A's preset",
      verbs: ["projects:read"],
    });
    await expect(
      callerB.verbPreset.update({ id: created.id, name: "Hijacked", verbs: ["boards:read"] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("verbPreset.remove", () => {
  test("deletes the preset", async () => {
    const uid = uidFor("vp-rm");
    await seedUser(uid);
    const caller = await makeCaller(uid);
    const created = await caller.verbPreset.create({
      name: "Doomed",
      verbs: ["projects:read"],
    });
    await caller.verbPreset.remove({ id: created.id });
    const list = await caller.verbPreset.list();
    expect(list.find((p) => p.id === created.id)).toBeUndefined();
  });

  test("NOT_FOUND for unknown id", async () => {
    const uid = uidFor("vp-rm-nf");
    await seedUser(uid);
    const caller = await makeCaller(uid);
    await expect(
      caller.verbPreset.remove({ id: "not-real" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
