import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Coarse DoS-protection counter — per spec §12. One row per bucket key
// (`ip:<hash>` or `subkey:<id>`); fixed-window-per-minute. The handler upserts
// this row with an "is the window stale?" check baked into the SQL so the
// hot-path is a single round-trip.
//
// Storage stays bounded: rows are reused across windows (no append-only
// growth). Stale rows linger until the next request for that bucket; they're
// harmless and are reaped by the audit-retention cron in phase 8b's follow-up
// (or just live forever for never-returning IPs — bounded by IP space).
export const rateLimitBucket = pgTable("rate_limit_bucket", {
  bucketKey: text("bucket_key").primaryKey(),
  /** Truncated to the start of the minute window the count belongs to. */
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
});

export type RateLimitBucketRow = typeof rateLimitBucket.$inferSelect;
