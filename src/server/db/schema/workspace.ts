import {
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Drizzle's pg-core does not export `bytea` as a built-in column helper, so we
// declare a small custom type. Buffer in / Buffer out matches `pg-node`'s
// default behaviour and lines up with how Uint8Array round-trips.
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

export const ownerType = pgEnum("owner_type", ["user", "organization"]);

export const weeekWorkspace = pgTable(
  "weeek_workspace",
  {
    id: text("id").primaryKey(),
    ownerType: ownerType("owner_type").notNull(),
    ownerId: text("owner_id").notNull(),
    weeekWorkspaceId: text("weeek_workspace_id"),
    name: text("name").notNull(),
    masterKeyCiphertext: byteaCol("master_key_ciphertext").notNull(),
    masterKeyIv: byteaCol("master_key_iv").notNull(),
    masterKeyTag: byteaCol("master_key_tag").notNull(),
    masterKeyLast4: text("master_key_last4").notNull(),
    masterKeyFingerprint: byteaCol("master_key_fingerprint").notNull(),
    encVersion: integer("enc_version").notNull().default(1),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index("weeek_workspace_owner_idx").on(t.ownerType, t.ownerId),
    fpUnique: uniqueIndex("weeek_workspace_owner_fingerprint_uq").on(
      t.ownerType,
      t.ownerId,
      t.masterKeyFingerprint,
    ),
  }),
);

export type WeeekWorkspaceRow = typeof weeekWorkspace.$inferSelect;
export type NewWeeekWorkspaceRow = typeof weeekWorkspace.$inferInsert;
