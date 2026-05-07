import { describe, expect, test } from "vitest";
import { errorResponse } from "@/server/proxy/errors";

describe("errorResponse", () => {
  test("returns spec §10 JSON envelope", async () => {
    const res = errorResponse({
      code: "verb_missing",
      status: 403,
      message: "Verb tasks:read not granted",
      subKeyId: "sk_abc",
      requestId: "req_123",
    });
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = (await res.json()) as { error: Record<string, string> };
    expect(body.error.code).toBe("verb_missing");
    expect(body.error.message).toBe("Verb tasks:read not granted");
    expect(body.error.subKeyId).toBe("sk_abc");
    expect(body.error.requestId).toBe("req_123");
  });

  test("omits subKeyId when not provided (unauthenticated path)", async () => {
    const res = errorResponse({
      code: "unauthenticated",
      status: 401,
      message: "Missing or invalid bearer",
      requestId: "req_456",
    });
    const body = (await res.json()) as { error: Record<string, string | undefined> };
    expect(body.error.subKeyId).toBeUndefined();
    expect(body.error.requestId).toBe("req_456");
  });
});
