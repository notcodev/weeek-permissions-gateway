import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const BASE = "https://weeek.test/public/v1";

const server = setupServer();

beforeAll(() => {
  process.env.WEEEK_API_BASE = BASE;
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("validateMasterKey", () => {
  test("returns ok on 200", async () => {
    server.use(
      http.get(`${BASE}/ws/members`, ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer good-key");
        return HttpResponse.json({ success: true, members: [] });
      }),
    );
    const { validateMasterKey } = await import("@/server/weeek/client");
    await expect(validateMasterKey("good-key")).resolves.toEqual({ ok: true });
  });

  test("throws unauthorized on 401", async () => {
    server.use(http.get(`${BASE}/ws/members`, () => HttpResponse.json({}, { status: 401 })));
    const { validateMasterKey } = await import("@/server/weeek/client");
    const { WeeekValidationError } = await import("@/server/weeek/errors");
    await expect(validateMasterKey("bad")).rejects.toBeInstanceOf(WeeekValidationError);
    await expect(validateMasterKey("bad")).rejects.toMatchObject({ reason: "unauthorized" });
  });

  test("throws upstream_5xx on 503", async () => {
    server.use(http.get(`${BASE}/ws/members`, () => HttpResponse.json({}, { status: 503 })));
    const { validateMasterKey } = await import("@/server/weeek/client");
    await expect(validateMasterKey("k")).rejects.toMatchObject({
      reason: "upstream_5xx",
      upstreamStatus: 503,
    });
  });

  test("throws network on connection error", async () => {
    server.use(http.get(`${BASE}/ws/members`, () => HttpResponse.error()));
    const { validateMasterKey } = await import("@/server/weeek/client");
    await expect(validateMasterKey("k")).rejects.toMatchObject({ reason: "network" });
  });

  test("throws unexpected_status on 418", async () => {
    server.use(http.get(`${BASE}/ws/members`, () => HttpResponse.json({}, { status: 418 })));
    const { validateMasterKey } = await import("@/server/weeek/client");
    await expect(validateMasterKey("k")).rejects.toMatchObject({
      reason: "unexpected_status",
      upstreamStatus: 418,
    });
  });
});
