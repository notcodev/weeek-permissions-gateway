import { describe, expect, test } from "vitest";

const ALLOWED = "http://localhost:3000";

function makeReq(method: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/trpc/anything", {
    method,
    headers,
  });
}

describe("isOriginAllowed", () => {
  test("GET cross-origin is allowed", async () => {
    const { isOriginAllowed } = await import("@/server/trpc/origin-check");
    expect(isOriginAllowed(makeReq("GET", { origin: "https://evil.test" }), ALLOWED)).toBe(true);
  });

  test("HEAD cross-origin is allowed", async () => {
    const { isOriginAllowed } = await import("@/server/trpc/origin-check");
    expect(isOriginAllowed(makeReq("HEAD", { origin: "https://evil.test" }), ALLOWED)).toBe(true);
  });

  test("POST same-origin is allowed", async () => {
    const { isOriginAllowed } = await import("@/server/trpc/origin-check");
    expect(isOriginAllowed(makeReq("POST", { origin: ALLOWED }), ALLOWED)).toBe(true);
  });

  test("POST cross-origin is blocked", async () => {
    const { isOriginAllowed } = await import("@/server/trpc/origin-check");
    expect(isOriginAllowed(makeReq("POST", { origin: "https://evil.test" }), ALLOWED)).toBe(false);
  });

  test("POST without Origin header is allowed (non-browser)", async () => {
    const { isOriginAllowed } = await import("@/server/trpc/origin-check");
    expect(isOriginAllowed(makeReq("POST"), ALLOWED)).toBe(true);
  });

  test("PATCH cross-origin is blocked", async () => {
    const { isOriginAllowed } = await import("@/server/trpc/origin-check");
    expect(isOriginAllowed(makeReq("PATCH", { origin: "https://evil.test" }), ALLOWED)).toBe(false);
  });

  test("DELETE cross-origin is blocked", async () => {
    const { isOriginAllowed } = await import("@/server/trpc/origin-check");
    expect(isOriginAllowed(makeReq("DELETE", { origin: "https://evil.test" }), ALLOWED)).toBe(
      false,
    );
  });

  test("trailing slash on allowed origin is normalised", async () => {
    const { isOriginAllowed } = await import("@/server/trpc/origin-check");
    expect(
      isOriginAllowed(
        makeReq("POST", { origin: "http://localhost:3000" }),
        "http://localhost:3000/",
      ),
    ).toBe(true);
  });
});
