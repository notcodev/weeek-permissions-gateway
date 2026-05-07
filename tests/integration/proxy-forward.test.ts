import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const WEEEK_BASE = "https://weeek.test/public/v1";
const server = setupServer();

beforeAll(() => {
  process.env.WEEEK_API_BASE = WEEEK_BASE;
  server.listen({ onUnhandledRequest: "error" });
});
afterAll(() => server.close());

describe("forward", () => {
  test("replaces Authorization with master key and passes through 200 body", async () => {
    let observedAuth = "";
    server.use(
      http.get(`${WEEEK_BASE}/ws/members`, ({ request }) => {
        observedAuth = request.headers.get("authorization") ?? "";
        return HttpResponse.json({ ok: true, who: "weeek" }, { status: 200 });
      }),
    );
    const { forward } = await import("@/server/proxy/forward");
    const req = new Request("https://gateway.test/api/v1/ws/members", {
      headers: { Authorization: "Bearer wgw_xxx" },
    });
    const res = await forward({
      masterKey: "wk_secret_master",
      pathname: "/ws/members",
      search: "",
      method: "GET",
      headers: req.headers,
      body: null,
    });
    expect(res.status).toBe(200);
    expect(observedAuth).toBe("Bearer wk_secret_master");
    const body = (await res.json()) as { ok: boolean; who: string };
    expect(body).toEqual({ ok: true, who: "weeek" });
  });

  test("passes through upstream 4xx body unchanged", async () => {
    server.use(
      http.get(`${WEEEK_BASE}/ws/projects`, () =>
        HttpResponse.json({ error: "weeek says no" }, { status: 404 }),
      ),
    );
    const { forward } = await import("@/server/proxy/forward");
    const res = await forward({
      masterKey: "wk_secret",
      pathname: "/ws/projects",
      search: "",
      method: "GET",
      headers: new Headers({ Authorization: "Bearer wgw_xxx" }),
      body: null,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("weeek says no");
  });

  test("returns upstream_error envelope on network failure", async () => {
    server.use(http.get(`${WEEEK_BASE}/ws/members`, () => HttpResponse.error()));
    const { forward } = await import("@/server/proxy/forward");
    const res = await forward({
      masterKey: "wk_secret",
      pathname: "/ws/members",
      search: "",
      method: "GET",
      headers: new Headers(),
      body: null,
      requestId: "req_test",
      subKeyId: "sk_test",
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe("upstream_error");
    expect(body.error.requestId).toBe("req_test");
  });

  test("preserves query string", async () => {
    let observedUrl = "";
    server.use(
      http.get(`${WEEEK_BASE}/ws/tasks`, ({ request }) => {
        observedUrl = request.url;
        return HttpResponse.json({});
      }),
    );
    const { forward } = await import("@/server/proxy/forward");
    await forward({
      masterKey: "wk",
      pathname: "/ws/tasks",
      search: "?projectId=9&boardId=4",
      method: "GET",
      headers: new Headers(),
      body: null,
    });
    expect(observedUrl).toContain("projectId=9");
    expect(observedUrl).toContain("boardId=4");
  });
});
