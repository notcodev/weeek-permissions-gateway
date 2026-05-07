import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { decrypt, encrypt } from "@/server/crypto/aesGcm";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

const SMOKE_PLAINTEXT = "readyz-smoke";

async function checkDb(): Promise<true | string> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch (err) {
    logger.error({ err }, "readyz: db ping failed");
    return err instanceof Error ? err.message : "db error";
  }
}

async function checkCrypto(): Promise<true | string> {
  try {
    const env = await encrypt(SMOKE_PLAINTEXT);
    const round = await decrypt(env);
    if (round !== SMOKE_PLAINTEXT) return "roundtrip mismatch";
    return true;
  } catch (err) {
    logger.error({ err }, "readyz: crypto smoke failed");
    return err instanceof Error ? err.message : "crypto error";
  }
}

export async function GET() {
  const [dbResult, cryptoResult] = await Promise.all([checkDb(), checkCrypto()]);
  const checks = {
    db: dbResult === true ? "ok" : dbResult,
    crypto: cryptoResult === true ? "ok" : cryptoResult,
  };
  const ready = dbResult === true && cryptoResult === true;
  return Response.json(
    { status: ready ? "ready" : "not_ready", checks },
    { status: ready ? 200 : 503 },
  );
}
