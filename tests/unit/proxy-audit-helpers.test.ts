import { randomBytes, createHmac } from "node:crypto";
import { beforeAll, describe, expect, test } from "vitest";

const PEPPER_B64 = randomBytes(32).toString("base64");

beforeAll(() => {
  process.env.FINGERPRINT_HMAC_PEPPER = PEPPER_B64;
});

describe("hashClientIp", () => {
  test("returns null when header is null", async () => {
    const { hashClientIp } = await import("@/server/proxy/audit");
    expect(hashClientIp(null)).toBeNull();
  });

  test("returns null when header is empty", async () => {
    const { hashClientIp } = await import("@/server/proxy/audit");
    expect(hashClientIp("")).toBeNull();
  });

  test("hashes the first hop with HMAC-SHA256(pepper, ip)", async () => {
    const { hashClientIp } = await import("@/server/proxy/audit");
    const ip = "203.0.113.7";
    const expected = createHmac("sha256", Buffer.from(PEPPER_B64, "base64"))
      .update(ip, "utf8")
      .digest();
    const out = hashClientIp(ip);
    expect(Buffer.from(out!).equals(expected)).toBe(true);
  });

  test("takes only the first hop in a comma-separated header", async () => {
    const { hashClientIp } = await import("@/server/proxy/audit");
    const ipFirst = "1.2.3.4";
    const ipSecond = "10.0.0.1";
    const out = hashClientIp(`${ipFirst}, ${ipSecond}`);
    const expectedFirst = createHmac("sha256", Buffer.from(PEPPER_B64, "base64"))
      .update(ipFirst, "utf8")
      .digest();
    expect(Buffer.from(out!).equals(expectedFirst)).toBe(true);
  });

  test("trims whitespace around the first hop", async () => {
    const { hashClientIp } = await import("@/server/proxy/audit");
    const out1 = hashClientIp("  9.9.9.9  ");
    const expected = createHmac("sha256", Buffer.from(PEPPER_B64, "base64"))
      .update("9.9.9.9", "utf8")
      .digest();
    expect(Buffer.from(out1!).equals(expected)).toBe(true);
  });
});

describe("truncateUserAgent", () => {
  test("null in, null out", async () => {
    const { truncateUserAgent } = await import("@/server/proxy/audit");
    expect(truncateUserAgent(null)).toBeNull();
  });

  test("under-limit string is unchanged", async () => {
    const { truncateUserAgent } = await import("@/server/proxy/audit");
    expect(truncateUserAgent("curl/8.0")).toBe("curl/8.0");
  });

  test("over-limit string is sliced to 200 chars", async () => {
    const { truncateUserAgent } = await import("@/server/proxy/audit");
    const big = "x".repeat(500);
    const out = truncateUserAgent(big);
    expect(out?.length).toBe(200);
    expect(out).toBe("x".repeat(200));
  });
});

describe("truncateQuery", () => {
  test("null in, null out", async () => {
    const { truncateQuery } = await import("@/server/proxy/audit");
    expect(truncateQuery(null)).toBeNull();
  });

  test("under-limit string is unchanged", async () => {
    const { truncateQuery } = await import("@/server/proxy/audit");
    expect(truncateQuery("?projectId=42")).toBe("?projectId=42");
  });

  test("over-limit string is sliced to 500 chars", async () => {
    const { truncateQuery } = await import("@/server/proxy/audit");
    const big = "?" + "k=v&".repeat(200);
    const out = truncateQuery(big);
    expect(out?.length).toBe(500);
  });
});
