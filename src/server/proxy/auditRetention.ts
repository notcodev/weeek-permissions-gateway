import { lt, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { auditLog } from "@/server/db/schema/auditLog";

const DEFAULT_RETENTION_DAYS = 90;

export function getRetentionDays(): number {
  const raw = process.env.AUDIT_RETENTION_DAYS;
  if (!raw) return DEFAULT_RETENTION_DAYS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RETENTION_DAYS;
  return n;
}

export type PurgeResult = {
  retentionDays: number;
  cutoff: Date;
  deleted: number;
};

/**
 * Delete audit_log rows with `created_at < now - retentionDays`. Returns the
 * cutoff timestamp and the number of rows removed. Idempotent — calling twice
 * back-to-back deletes 0 the second time.
 */
export async function purgeAuditOlderThan(retentionDays: number): Promise<PurgeResult> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(auditLog)
    .where(lt(auditLog.createdAt, cutoff))
    .returning({ id: auditLog.id });
  return { retentionDays, cutoff, deleted: result.length };
}

export async function purgeAuditWithEnvDefault(): Promise<PurgeResult> {
  return purgeAuditOlderThan(getRetentionDays());
}

// Re-exported for tests that want a deterministic SQL shape check.
export const _internalSql = { lt, sql };
