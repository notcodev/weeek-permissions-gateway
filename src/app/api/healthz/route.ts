import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch (err) {
    logger.error({ err }, "healthz: db ping failed");
    return Response.json({ status: "down", reason: "db" }, { status: 503 });
  }
}
