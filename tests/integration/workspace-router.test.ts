import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const WEEEK_BASE = "https://weeek.test/public/v1";
const server = setupServer();

beforeAll(() => {
  process.env.MASTER_KEY_ENC_KEY ||= randomBytes(32).toString("base64");
  process.env.WEEEK_API_BASE = WEEEK_BASE;
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function makeCaller() {
  const { appRouter } = await import("@/server/trpc/routers");
  const fakeSession = {
    user: { id: "test-user-1", email: "u1@example.com", name: "U1" },
    session: { id: "s1", token: "t1" },
  };
  return appRouter.createCaller({
    session: fakeSession as never,
    headers: new Headers(),
  });
}

async function makeOtherCaller() {
  const { appRouter } = await import("@/server/trpc/routers");
  const fakeSession = {
    user: { id: "test-user-2", email: "u2@example.com", name: "U2" },
    session: { id: "s2", token: "t2" },
  };
  return appRouter.createCaller({
    session: fakeSession as never,
    headers: new Headers(),
  });
}

describe("workspace router", () => {
  test("import → list → remove happy path", async () => {
    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ success: true })));

    const caller = await makeCaller();

    const created = await caller.workspace.import({
      name: "Personal Weeek",
      masterKey: "wk_aaaaaaaaaaaaaaaaaaaaaaaa1234",
    });
    expect(created.name).toBe("Personal Weeek");
    expect(created.masterKeyLast4).toBe("1234");
    expect(created.lastVerifiedAt).toBeInstanceOf(Date);
    expect(created.ownerType).toBe("user");

    const list = await caller.workspace.list();
    expect(list.find((w) => w.id === created.id)?.masterKeyLast4).toBe("1234");

    const removed = await caller.workspace.remove({ id: created.id });
    expect(removed.ok).toBe(true);

    const after = await caller.workspace.list();
    expect(after.find((w) => w.id === created.id)).toBeUndefined();
  });

  test("rejects when Weeek returns 401", async () => {
    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({}, { status: 401 })));
    const caller = await makeCaller();
    await expect(
      caller.workspace.import({ name: "Bad", masterKey: "definitely-bad-key" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("rejects duplicate import for the same owner", async () => {
    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ success: true })));
    const caller = await makeCaller();
    const key = "wk_dup_1234567890_abcd";
    await caller.workspace.import({ name: "First", masterKey: key });
    await expect(
      caller.workspace.import({ name: "Second", masterKey: key }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("isolates workspaces by owner", async () => {
    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ success: true })));
    const a = await makeCaller();
    const b = await makeOtherCaller();

    await a.workspace.import({ name: "A's WS", masterKey: "wk_a_1234567890_abcd" });
    const bList = await b.workspace.list();
    expect(bList.find((w) => w.name === "A's WS")).toBeUndefined();
  });

  test("remove returns NOT_FOUND for someone else's workspace", async () => {
    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({ success: true })));
    const a = await makeCaller();
    const b = await makeOtherCaller();
    const wsa = await a.workspace.import({ name: "A's", masterKey: "wk_iso_1234567890_abcd" });
    await expect(b.workspace.remove({ id: wsa.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
