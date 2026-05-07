import { describe, expect, test, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";

describe("sub-key crypto", () => {
  beforeAll(() => {
    process.env.SUB_KEY_HMAC_PEPPER = randomBytes(32).toString("base64");
  });

  test("generateRawSubKey returns a wgw_ prefixed key", async () => {
    const { generateRawSubKey, RAW_KEY_PREFIX } = await import("@/server/crypto/subKey");
    const k = generateRawSubKey();
    expect(k.startsWith(RAW_KEY_PREFIX)).toBe(true);
    expect(RAW_KEY_PREFIX).toBe("wgw_");
  });

  test("generateRawSubKey produces 32 bytes of base64url after the prefix", async () => {
    const { generateRawSubKey, RAW_KEY_PREFIX } = await import("@/server/crypto/subKey");
    const k = generateRawSubKey();
    const tail = k.slice(RAW_KEY_PREFIX.length);
    // base64url of 32 bytes = 43 chars (no padding)
    expect(tail.length).toBe(43);
    // base64url alphabet: A-Z a-z 0-9 - _
    expect(/^[A-Za-z0-9_-]+$/.test(tail)).toBe(true);
  });

  test("two consecutive generateRawSubKey calls return different keys", async () => {
    const { generateRawSubKey } = await import("@/server/crypto/subKey");
    const a = generateRawSubKey();
    const b = generateRawSubKey();
    expect(a).not.toBe(b);
  });

  test("hashSubKey returns 32 bytes", async () => {
    const { hashSubKey } = await import("@/server/crypto/subKey");
    const h = hashSubKey("wgw_abcdef");
    expect(h.byteLength).toBe(32);
  });

  test("hashSubKey is deterministic for the same input + pepper", async () => {
    const { hashSubKey } = await import("@/server/crypto/subKey");
    const a = hashSubKey("wgw_xyz");
    const b = hashSubKey("wgw_xyz");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  test("hashSubKey differs across pepper rotation", async () => {
    const original = process.env.SUB_KEY_HMAC_PEPPER;
    try {
      const mod = await import("@/server/crypto/subKey");
      const a = mod.hashSubKey("wgw_same");
      process.env.SUB_KEY_HMAC_PEPPER = randomBytes(32).toString("base64");
      const b = mod.hashSubKey("wgw_same");
      expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    } finally {
      process.env.SUB_KEY_HMAC_PEPPER = original;
    }
  });

  test("hashSubKey throws if SUB_KEY_HMAC_PEPPER is missing", async () => {
    const original = process.env.SUB_KEY_HMAC_PEPPER;
    delete process.env.SUB_KEY_HMAC_PEPPER;
    try {
      const { hashSubKey } = await import("@/server/crypto/subKey");
      expect(() => hashSubKey("wgw_x")).toThrow(/SUB_KEY_HMAC_PEPPER/);
    } finally {
      process.env.SUB_KEY_HMAC_PEPPER = original;
    }
  });

  test("hashSubKey throws if SUB_KEY_HMAC_PEPPER decodes to wrong byte length", async () => {
    const original = process.env.SUB_KEY_HMAC_PEPPER;
    process.env.SUB_KEY_HMAC_PEPPER = Buffer.alloc(16, 0).toString("base64");
    try {
      const { hashSubKey } = await import("@/server/crypto/subKey");
      expect(() => hashSubKey("wgw_x")).toThrow(/32 bytes/);
    } finally {
      process.env.SUB_KEY_HMAC_PEPPER = original;
    }
  });

  test("subKeyLast4 returns the last 4 chars of the full bearer", async () => {
    const { subKeyLast4 } = await import("@/server/crypto/subKey");
    expect(subKeyLast4("wgw_abcdefghij1234")).toBe("1234");
  });
});
