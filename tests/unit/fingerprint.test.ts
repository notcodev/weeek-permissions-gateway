import { describe, expect, test, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";

describe("fingerprint (HMAC-SHA256, keyed)", () => {
  beforeAll(() => {
    process.env.FINGERPRINT_HMAC_PEPPER = randomBytes(32).toString("base64");
  });

  test("returns 32 bytes", async () => {
    const { fingerprint } = await import("@/server/crypto/fingerprint");
    const fp = fingerprint("hello");
    expect(fp.byteLength).toBe(32);
  });

  test("is deterministic for the same input + same pepper", async () => {
    const { fingerprint } = await import("@/server/crypto/fingerprint");
    const a = fingerprint("token");
    const b = fingerprint("token");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  test("differs for different inputs", async () => {
    const { fingerprint } = await import("@/server/crypto/fingerprint");
    const a = fingerprint("token-a");
    const b = fingerprint("token-b");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  test("differs when the pepper differs (defeats offline dictionary)", async () => {
    const original = process.env.FINGERPRINT_HMAC_PEPPER;
    try {
      const mod = await import("@/server/crypto/fingerprint");
      const a = mod.fingerprint("token");
      // Force a re-import with a different pepper. We rely on the
      // implementation reading `process.env` lazily on each call.
      process.env.FINGERPRINT_HMAC_PEPPER = randomBytes(32).toString("base64");
      const b = mod.fingerprint("token");
      expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    } finally {
      process.env.FINGERPRINT_HMAC_PEPPER = original;
    }
  });

  test("throws if FINGERPRINT_HMAC_PEPPER is missing", async () => {
    const original = process.env.FINGERPRINT_HMAC_PEPPER;
    delete process.env.FINGERPRINT_HMAC_PEPPER;
    try {
      const { fingerprint } = await import("@/server/crypto/fingerprint");
      expect(() => fingerprint("token")).toThrow(/FINGERPRINT_HMAC_PEPPER/);
    } finally {
      process.env.FINGERPRINT_HMAC_PEPPER = original;
    }
  });

  test("throws if FINGERPRINT_HMAC_PEPPER decodes to wrong byte length", async () => {
    const original = process.env.FINGERPRINT_HMAC_PEPPER;
    process.env.FINGERPRINT_HMAC_PEPPER = Buffer.alloc(16, 0).toString("base64");
    try {
      const { fingerprint } = await import("@/server/crypto/fingerprint");
      expect(() => fingerprint("token")).toThrow(/32 bytes/);
    } finally {
      process.env.FINGERPRINT_HMAC_PEPPER = original;
    }
  });

  test("last4 returns the last 4 visible chars of the raw key", async () => {
    const { last4 } = await import("@/server/crypto/fingerprint");
    expect(last4("abcdef1234")).toBe("1234");
    expect(last4("xy")).toBe("xy");
  });
});
