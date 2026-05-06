import { createHmac } from "node:crypto";

const PEPPER_BYTES = 32;

function getPepper(): Buffer {
  const b64 = process.env.FINGERPRINT_HMAC_PEPPER;
  if (!b64) throw new Error("FINGERPRINT_HMAC_PEPPER is required");
  const raw = Buffer.from(b64, "base64");
  if (raw.byteLength !== PEPPER_BYTES) {
    throw new Error(
      `FINGERPRINT_HMAC_PEPPER must decode to ${PEPPER_BYTES} bytes (got ${raw.byteLength})`,
    );
  }
  return raw;
}

export function fingerprint(rawKey: string): Uint8Array {
  return new Uint8Array(createHmac("sha256", getPepper()).update(rawKey, "utf8").digest());
}

export function last4(rawKey: string): string {
  return rawKey.length <= 4 ? rawKey : rawKey.slice(-4);
}
