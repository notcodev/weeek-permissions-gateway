import { customType, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { weeekWorkspace } from "./workspace";
import { subKey } from "./subKey";

const byteaCol = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Uint8Array): Buffer {
    return Buffer.from(value);
  },
  fromDriver(value: Buffer): Uint8Array {
    return new Uint8Array(value);
  },
});

// Audit log captures every proxy request — the deny path AND the success path —
// so retroactive policy review and incident response have a record. Path/query/
// status/timing only; per spec §12 no request bodies, no master keys.
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => weeekWorkspace.id, { onDelete: "cascade" }),
    // SET NULL so revoking a sub-key (or workspace cascade) preserves history
    // for future investigations, while pre-auth denies (no sub-key match) carry null.
    subKeyId: text("sub_key_id").references(() => subKey.id, {
      onDelete: "set null",
    }),
    requestId: text("request_id").notNull(),
    method: text("method").notNull(),
    /** Proxied path with no `/api/v1` prefix, matching the route table. */
    path: text("path").notNull(),
    /** Full query string including leading "?", truncated to 500 chars. */
    query: text("query"),
    /** Status the gateway returned to the client. */
    ourStatus: integer("our_status").notNull(),
    /** Upstream status as a string — "200" / "503" / "network_error" / "timeout" / "unknown". */
    upstreamStatus: text("upstream_status").notNull(),
    /** Wall-clock latency from request entry to response handoff. */
    latencyMs: integer("latency_ms").notNull(),
    /** Matched verb when the route was recognised; null on unknown_route or pre-auth fail. */
    verb: text("verb"),
    /** Why the gateway denied — `unauthenticated` / `verb_missing` / etc; null on success. */
    denyReason: text("deny_reason"),
    /** HMAC-SHA256 of the first hop in `x-forwarded-for`, peppered with FINGERPRINT_HMAC_PEPPER. */
    ipHash: byteaCol("ip_hash"),
    /** User agent header, truncated to 200 chars. */
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceTimeIdx: index("audit_log_workspace_time_idx").on(t.workspaceId, t.createdAt),
    subKeyTimeIdx: index("audit_log_sub_key_time_idx").on(t.subKeyId, t.createdAt),
    workspaceDenyIdx: index("audit_log_workspace_deny_idx").on(t.workspaceId, t.denyReason),
  }),
);

export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogRow = typeof auditLog.$inferInsert;
