import { logger } from "@/server/logger";
import { purgeAuditWithEnvDefault } from "@/server/proxy/auditRetention";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: { code: "unauthorized" } }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

function authCheck(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get("authorization");
  if (!header) return false;
  const [scheme, value] = header.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !value) return false;
  if (value.length !== expected.length) return false;
  let acc = 0;
  for (let i = 0; i < value.length; i++) {
    acc |= value.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return acc === 0;
}

async function handle(req: Request): Promise<Response> {
  if (!authCheck(req)) return unauthorized();
  try {
    const { retentionDays, cutoff, deleted } = await purgeAuditWithEnvDefault();
    logger.info(
      { retentionDays, cutoffIso: cutoff.toISOString(), deleted },
      "audit retention purge complete",
    );
    return Response.json({ ok: true, retentionDays, cutoff: cutoff.toISOString(), deleted });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "audit retention purge failed");
    return Response.json({ error: { code: "internal_error" } }, { status: 500 });
  }
}

export { handle as GET, handle as POST };
