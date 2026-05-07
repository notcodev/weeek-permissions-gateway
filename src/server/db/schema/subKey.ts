import {
  boolean,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { weeekWorkspace } from "./workspace";

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

export const subKeyStatus = pgEnum("sub_key_status", ["active", "revoked"]);

export const subKey = pgTable(
  "sub_key",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => weeekWorkspace.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    prefix: text("prefix").notNull().default("wgw_"),
    hash: byteaCol("hash").notNull(),
    last4: text("last4").notNull(),
    status: subKeyStatus("status").notNull().default("active"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: text("revoked_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    boundWeeekUserId: text("bound_weeek_user_id"),
    boundWeeekUserName: text("bound_weeek_user_name"),
    visibilityBound: boolean("visibility_bound").notNull().default(false),
    authorRewrite: boolean("author_rewrite").notNull().default(false),
    scopeProjects: text("scope_projects").array().notNull(),
    scopeBoards: text("scope_boards").array().notNull(),
    verbs: text("verbs").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    useCount: integer("use_count").notNull().default(0),
  },
  (t) => ({
    hashUnique: uniqueIndex("sub_key_hash_uq").on(t.hash),
    workspaceIdx: index("sub_key_workspace_idx").on(t.workspaceId),
    workspaceStatusIdx: index("sub_key_workspace_status_idx").on(t.workspaceId, t.status),
  }),
);

export type SubKeyRow = typeof subKey.$inferSelect;
export type NewSubKeyRow = typeof subKey.$inferInsert;
