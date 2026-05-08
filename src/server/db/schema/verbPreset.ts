import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ownerType } from "./workspace";

export const verbPreset = pgTable(
  "verb_preset",
  {
    id: text("id").primaryKey(),
    ownerType: ownerType("owner_type").notNull(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    // Verbs stored as a postgres text[] — small set (<=50) per row, no need
    // for a join table. Validated against VERB_CATALOG at write time.
    verbs: text("verbs").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index("verb_preset_owner_idx").on(t.ownerType, t.ownerId),
    nameUq: uniqueIndex("verb_preset_owner_name_uq").on(t.ownerType, t.ownerId, t.name),
  }),
);

export type VerbPresetRow = typeof verbPreset.$inferSelect;
export type NewVerbPresetRow = typeof verbPreset.$inferInsert;
