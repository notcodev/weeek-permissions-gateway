import { createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/server/db/client";
import { auditLog } from "@/server/db/schema/auditLog";
import { subKey } from "@/server/db/schema/subKey";
import { logger } from "@/server/logger";

const QUERY_MAX = 500;
const UA_MAX = 200;
const IP_PEPPER_BYTES = 32;

let cachedPepper: Buffer | undefined;

function getIpPepper(): Buffer {
  if (cachedPepper) return cachedPepper;
  const b64 = process.env.FINGERPRINT_HMAC_PEPPER;
  if (!b64) throw new Error("FINGERPRINT_HMAC_PEPPER is required");
  const raw = Buffer.from(b64, "base64");
  if (raw.byteLength !== IP_PEPPER_BYTES) {
    throw new Error(
      `FINGERPRINT_HMAC_PEPPER must decode to ${IP_PEPPER_BYTES} bytes (got ${raw.byteLength})`,
    );
  }
  cachedPepper = raw;
  return raw;
}

/**
 * Pull the first hop in `x-forwarded-for` and HMAC-hash it. Header is comma-
 * separated when behind multiple proxies. Returns null when the header is
 * absent or empty so the audit row records "no IP captured" instead of
 * hashing an empty string.
 */
export function hashClientIp(forwardedFor: string | null): Uint8Array | null {
  if (!forwardedFor) return null;
  const first = forwardedFor.split(",")[0]?.trim();
  if (!first) return null;
  return new Uint8Array(createHmac("sha256", getIpPepper()).update(first, "utf8").digest());
}

export function truncateUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  return ua.length <= UA_MAX ? ua : ua.slice(0, UA_MAX);
}

export function truncateQuery(q: string | null): string | null {
  if (!q) return null;
  return q.length <= QUERY_MAX ? q : q.slice(0, QUERY_MAX);
}

export type AuditInput = {
  workspaceId: string;
  /** Null for pre-auth denials where we never identified a sub-key. */
  subKeyId: string | null;
  requestId: string;
  method: string;
  /** Proxied path with no `/api/v1` prefix. */
  path: string;
  /** Full query string with leading "?", or null. Truncated by helper. */
  query: string | null;
  ourStatus: number;
  upstreamStatus: string;
  latencyMs: number;
  verb: string | null;
  denyReason: string | null;
  forwardedFor: string | null;
  userAgent: string | null;
};

/**
 * Best-effort audit insert. Awaited inside `void recordAudit(...)` from the
 * handler — never blocks the response. Errors logged at warn level so a DB
 * outage doesn't take the proxy down.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLog).values({
      id: createId(),
      workspaceId: input.workspaceId,
      subKeyId: input.subKeyId,
      requestId: input.requestId,
      method: input.method,
      path: input.path,
      query: truncateQuery(input.query),
      ourStatus: input.ourStatus,
      upstreamStatus: input.upstreamStatus,
      latencyMs: input.latencyMs,
      verb: input.verb,
      denyReason: input.denyReason,
      ipHash: hashClientIp(input.forwardedFor),
      userAgent: truncateUserAgent(input.userAgent),
    });
  } catch (err) {
    logger.warn(
      {
        err,
        requestId: input.requestId,
        subKeyId: input.subKeyId?.slice(0, 8) ?? null,
      },
      "recordAudit failed",
    );
  }
}

/**
 * Best-effort sub-key usage stamp. Updates the lastUsedAt + useCount roll-up
 * on the sub_key row. Separate from `recordAudit` because that targets the
 * append-only history table and this targets the per-sub-key snapshot.
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
