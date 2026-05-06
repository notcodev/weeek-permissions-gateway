const ENC_VERSION = 1;
const ALG = "AES-GCM";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type Envelope = {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  tag: Uint8Array;
  encVersion: number;
};

let cachedKey: CryptoKey | undefined;

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const b64 = process.env.MASTER_KEY_ENC_KEY;
  if (!b64) throw new Error("MASTER_KEY_ENC_KEY is required");
  const raw = Buffer.from(b64, "base64");
  if (raw.byteLength !== KEY_BYTES) {
    throw new Error(`MASTER_KEY_ENC_KEY must decode to ${KEY_BYTES} bytes (got ${raw.byteLength})`);
  }
  cachedKey = await crypto.subtle.importKey("raw", raw, { name: ALG }, false, [
    "encrypt",
    "decrypt",
  ]);
  return cachedKey;
}

export async function encrypt(plaintext: string): Promise<Envelope> {
  const key = await getKey();
  const iv = new Uint8Array(new ArrayBuffer(IV_BYTES));
  crypto.getRandomValues(iv);
  const data = new TextEncoder().encode(plaintext);
  const out = new Uint8Array(
    await crypto.subtle.encrypt({ name: ALG, iv, tagLength: TAG_BYTES * 8 }, key, data),
  );
  // WebCrypto returns ciphertext || tag concatenated. Split for separate storage.
  const ciphertext = out.slice(0, out.byteLength - TAG_BYTES);
  const tag = out.slice(out.byteLength - TAG_BYTES);
  return { ciphertext, iv, tag, encVersion: ENC_VERSION };
}

export async function decrypt(env: Envelope): Promise<string> {
  if (env.encVersion !== ENC_VERSION) {
    throw new Error(`unsupported encVersion: ${env.encVersion}`);
  }
  const key = await getKey();
  const joined = new Uint8Array(new ArrayBuffer(env.ciphertext.byteLength + env.tag.byteLength));
  joined.set(env.ciphertext, 0);
  joined.set(env.tag, env.ciphertext.byteLength);
  const ivBuf = new Uint8Array(new ArrayBuffer(env.iv.byteLength));
  ivBuf.set(env.iv, 0);
  const plain = await crypto.subtle.decrypt(
    { name: ALG, iv: ivBuf, tagLength: TAG_BYTES * 8 },
    key,
    joined,
  );
  return new TextDecoder().decode(plain);
}

export const ENC = { ENC_VERSION, KEY_BYTES, IV_BYTES, TAG_BYTES } as const;
