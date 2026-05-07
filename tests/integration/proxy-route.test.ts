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

describe("/api/v1/[...path] route module", () => {
  test("exports GET/POST/PATCH/DELETE bound to the handler", async () => {
    const mod = await import("@/app/api/v1/[...path]/route");
    expect(typeof mod.GET).toBe("function");
    expect(typeof mod.POST).toBe("function");
    expect(typeof mod.PATCH).toBe("function");
    expect(typeof mod.DELETE).toBe("function");
    expect(mod.runtime).toBe("nodejs");
    expect(mod.dynamic).toBe("force-dynamic");
  });

  test("GET delegates to proxy and returns 401 when no bearer", async () => {
    const mod = await import("@/app/api/v1/[...path]/route");
    const req = new Request("https://gw.test/api/v1/ws/members");
    const res = await mod.GET(req);
    expect(res.status).toBe(401);
  });

  test("rejects body > 10 MB with 413 body_too_large", async () => {
    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.json({})));
    const mod = await import("@/app/api/v1/[...path]/route");
    const headers = new Headers();
    headers.set("authorization", "Bearer wgw_xxx");
    headers.set("content-length", `${10 * 1024 * 1024 + 1}`);
    const req = new Request("https://gw.test/api/v1/ws/members", {
      method: "POST",
      headers,
      body: "x",
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("body_too_large");
  });
});
