import { describe, expect, test, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";

describe("aesGcm envelope", () => {
  beforeAll(() => {
    process.env.MASTER_KEY_ENC_KEY = randomBytes(32).toString("base64");
  });

  test("encrypts then decrypts to the original plaintext", async () => {
    const { encrypt, decrypt } = await import("@/server/crypto/aesGcm");
    const plain = "weeek_pat_super_secret_token_value";
    const env = await encrypt(plain);

    expect(env.ciphertext.byteLength).toBeGreaterThan(0);
    expect(env.iv.byteLength).toBe(12);
    expect(env.tag.byteLength).toBe(16);
    expect(env.encVersion).toBe(1);

    const round = await decrypt(env);
    expect(round).toBe(plain);
  });

  test("each encrypt() of the same plaintext produces a fresh IV", async () => {
    const { encrypt } = await import("@/server/crypto/aesGcm");
    const a = await encrypt("same");
    const b = await encrypt("same");
    expect(Buffer.from(a.iv).equals(Buffer.from(b.iv))).toBe(false);
    expect(Buffer.from(a.ciphertext).equals(Buffer.from(b.ciphertext))).toBe(false);
  });

  test("decrypt rejects a tampered ciphertext", async () => {
    const { encrypt, decrypt } = await import("@/server/crypto/aesGcm");
    const env = await encrypt("payload");
    const flipped = new Uint8Array(env.ciphertext);
    flipped[0] = (flipped[0] ?? 0) ^ 0x01;
    await expect(decrypt({ ...env, ciphertext: flipped })).rejects.toThrow();
  });

  test("decrypt rejects a tampered tag", async () => {
    const { encrypt, decrypt } = await import("@/server/crypto/aesGcm");
    const env = await encrypt("payload");
    const flipped = new Uint8Array(env.tag);
    flipped[0] = (flipped[0] ?? 0) ^ 0x01;
    await expect(decrypt({ ...env, tag: flipped })).rejects.toThrow();
  });

  test("decrypt rejects an unsupported encVersion", async () => {
    const { encrypt, decrypt } = await import("@/server/crypto/aesGcm");
    const env = await encrypt("payload");
    await expect(decrypt({ ...env, encVersion: 99 })).rejects.toThrow(/encVersion/);
  });
});
