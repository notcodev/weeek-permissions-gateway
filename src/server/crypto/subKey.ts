import { createHmac, randomBytes } from "node:crypto";

const PEPPER_BYTES = 32;
const RAW_BYTES = 32;

export const RAW_KEY_PREFIX = "wgw_";

function getPepper(): Buffer {
  const b64 = process.env.SUB_KEY_HMAC_PEPPER;
  if (!b64) throw new Error("SUB_KEY_HMAC_PEPPER is required");
  const raw = Buffer.from(b64, "base64");
  if (raw.byteLength !== PEPPER_BYTES) {
    throw new Error(
      `SUB_KEY_HMAC_PEPPER must decode to ${PEPPER_BYTES} bytes (got ${raw.byteLength})`,
    );
  }
  return raw;
}

export function generateRawSubKey(): string {
  const tail = randomBytes(RAW_BYTES).toString("base64url");
  return `${RAW_KEY_PREFIX}${tail}`;
}

export function hashSubKey(rawKey: string): Uint8Array {
  return new Uint8Array(createHmac("sha256", getPepper()).update(rawKey, "utf8").digest());
}

export function subKeyLast4(rawKey: string): string {
  return rawKey.length <= 4 ? rawKey : rawKey.slice(-4);
}
