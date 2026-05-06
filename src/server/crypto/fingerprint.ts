import { createHash } from "node:crypto";

export function fingerprint(rawKey: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(rawKey, "utf8").digest());
}

export function last4(rawKey: string): string {
  return rawKey.length <= 4 ? rawKey : rawKey.slice(-4);
}
