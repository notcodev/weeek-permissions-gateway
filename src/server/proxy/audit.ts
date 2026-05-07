import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { subKey } from "@/server/db/schema/subKey";
import { logger } from "@/server/logger";

/**
 * Best-effort usage stamp. Awaited inside `ctx.waitUntil` (Next/edge) or
 * via `void recordUsage(...)` from the handler — never blocks the response.
 */
export async function recordUsage(subKeyId: string): Promise<void> {
  try {
    await db
      .update(subKey)
      .set({
        lastUsedAt: new Date(),
        useCount: sql`${subKey.useCount} + 1`,
      })
      .where(eq(subKey.id, subKeyId));
  } catch (err) {
    logger.warn({ err, subKeyId: subKeyId.slice(0, 8) }, "recordUsage failed");
  }
}
