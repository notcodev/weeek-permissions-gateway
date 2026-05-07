import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { rateLimitBucket } from "@/server/db/schema/rateLimit";

const WINDOW_MS = 60_000;

export const RATE_LIMITS = {
  /** Spec §12: 60 req/min per client IP. */
  perIpPerMinute: 60,
  /** Spec §12: 600 req/min per sub-key. */
  perSubKeyPerMinute: 600,
} as const;

export type CheckResult =
  | { allowed: true; count: number; remaining: number; retryAfterSec: number }
  | { allowed: false; count: number; remaining: 0; retryAfterSec: number };

/**
 * Atomic UPSERT-or-reset for the bucket. Single round-trip:
 *   - If the existing row's window_start is within the last WINDOW_MS, increment count.
 *   - Otherwise reset count to 1 and roll the window forward to `now`.
 * Returns the post-write count and the seconds until the current window expires.
 *
 * Raw SQL form: drizzle's onConflictDoUpdate has historically had quirks when
 * the same column appears in both INSERT and UPDATE branches with CASE that
 * references itself. Raw form is unambiguous and still single-round-trip.
 */
export async function checkAndIncrement(
  bucketKey: string,
  limitPerMinute: number,
): Promise<CheckResult> {
  const rows = await db.execute(sql`
    INSERT INTO rate_limit_bucket (bucket_key, window_start, count)
    VALUES (${bucketKey}, now(), 1)
    ON CONFLICT (bucket_key) DO UPDATE
    SET count = CASE
                  WHEN rate_limit_bucket.window_start >= now() - interval '60 seconds'
                  THEN rate_limit_bucket.count + 1
                  ELSE 1
                END,
        window_start = CASE
                         WHEN rate_limit_bucket.window_start >= now() - interval '60 seconds'
                         THEN rate_limit_bucket.window_start
                         ELSE now()
                       END
    RETURNING count, window_start
  `);

  const arr = rows as unknown as ReadonlyArray<{
    count: number | string;
    window_start: Date | string;
  }>;
  const row = arr[0];
  if (!row) {
    // Defensive: should not happen with RETURNING.
    return { allowed: true, count: 1, remaining: limitPerMinute - 1, retryAfterSec: 60 };
  }
  const count = typeof row.count === "string" ? Number.parseInt(row.count, 10) : row.count;
  const ws = row.window_start instanceof Date ? row.window_start : new Date(row.window_start);
  const elapsedMs = Date.now() - ws.getTime();
  const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - elapsedMs) / 1000));

  if (count > limitPerMinute) {
    return { allowed: false, count, remaining: 0, retryAfterSec };
  }
  return {
    allowed: true,
    count,
    remaining: Math.max(0, limitPerMinute - count),
    retryAfterSec,
  };
}

export function ipBucketKey(hashedIpHex: string): string {
  return `ip:${hashedIpHex}`;
}

export function subKeyBucketKey(subKeyId: string): string {
  return `subkey:${subKeyId}`;
}

/** Test-only helper to wipe rate-limit state between cases. */
export async function _resetRateLimitsForTests(): Promise<void> {
  await db.delete(rateLimitBucket);
}
