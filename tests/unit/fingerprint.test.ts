import { describe, expect, test } from "vitest";

describe("fingerprint", () => {
  test("returns 32 bytes of sha256(rawKey)", async () => {
    const { fingerprint } = await import("@/server/crypto/fingerprint");
    const fp = fingerprint("hello");
    expect(fp.byteLength).toBe(32);
    // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(Buffer.from(fp).toString("hex")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  test("is deterministic", async () => {
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

  test("last4 returns the last 4 visible chars of the raw key", async () => {
    const { last4 } = await import("@/server/crypto/fingerprint");
    expect(last4("abcdef1234")).toBe("1234");
    expect(last4("xy")).toBe("xy"); // shorter than 4 — return verbatim
  });
});
