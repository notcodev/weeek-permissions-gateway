import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ready" });
  } catch (err) {
    logger.error({ err }, "readyz: db ping failed");
    return Response.json({ status: "not_ready" }, { status: 503 });
  }
}
