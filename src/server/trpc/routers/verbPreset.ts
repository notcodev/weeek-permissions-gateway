import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { db } from "@/server/db/client";
import { verbPreset } from "@/server/db/schema/verbPreset";
import { isVerb } from "@/server/verbs";
import { assertWriteRole, resolveOwnerContext } from "../ownerContext";
import { protectedProcedure, router } from "../init";

const NAME_MIN = 1;
const NAME_MAX = 60;
const VERBS_MIN = 1;
const VERBS_MAX = 50;

const verbsSchema = z
  .array(z.string().refine(isVerb, "Unknown verb"))
  .min(VERBS_MIN, "Pick at least one verb")
  .max(VERBS_MAX, "Too many verbs");

const createInput = z.object({
  name: z.string().trim().min(NAME_MIN, "Name is required").max(NAME_MAX),
  verbs: verbsSchema,
});

const updateInput = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(NAME_MIN).max(NAME_MAX),
  verbs: verbsSchema,
});

const removeInput = z.object({ id: z.string().min(1) });

export type VerbPresetPublic = {
  id: string;
  ownerType: "user" | "organization";
  ownerId: string;
  name: string;
  verbs: string[];
  createdAt: Date;
  updatedAt: Date;
};

function toPublic(row: typeof verbPreset.$inferSelect): VerbPresetPublic {
  return {
    id: row.id,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    name: row.name,
    verbs: row.verbs,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const NAME_CONSTRAINT = "verb_preset_owner_name_uq";

function isUniqueViolationOnConstraint(err: unknown, constraint: string): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    if (
      typeof cur === "object" &&
      cur !== null &&
      (cur as { code?: string }).code === "23505" &&
      (cur as { constraint_name?: string }).constraint_name === constraint
    ) {
      return true;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

export const verbPresetRouter = router({
  list: protectedProcedure.query(async ({ ctx }): Promise<VerbPresetPublic[]> => {
    const owner = await resolveOwnerContext(ctx.session);
    const rows = await db
      .select()
      .from(verbPreset)
      .where(
        and(eq(verbPreset.ownerType, owner.ownerType), eq(verbPreset.ownerId, owner.ownerId)),
      )
      .orderBy(asc(verbPreset.name));
    return rows.map(toPublic);
  }),

  create: protectedProcedure
    .input(createInput)
    .mutation(async ({ ctx, input }): Promise<VerbPresetPublic> => {
      const owner = await resolveOwnerContext(ctx.session);
      assertWriteRole(owner, "Saving a preset");

      const id = createId();
      const now = new Date();
      try {
        const [row] = await db
          .insert(verbPreset)
          .values({
            id,
            ownerType: owner.ownerType,
            ownerId: owner.ownerId,
            name: input.name,
            verbs: input.verbs,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!row)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Insert returned no row",
          });
        return toPublic(row);
      } catch (err) {
        if (isUniqueViolationOnConstraint(err, NAME_CONSTRAINT)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A preset with this name already exists",
          });
        }
        throw err;
      }
    }),

  update: protectedProcedure
    .input(updateInput)
    .mutation(async ({ ctx, input }): Promise<VerbPresetPublic> => {
      const owner = await resolveOwnerContext(ctx.session);
      assertWriteRole(owner, "Updating a preset");

      try {
        const [row] = await db
          .update(verbPreset)
          .set({ name: input.name, verbs: input.verbs, updatedAt: new Date() })
          .where(
            and(
              eq(verbPreset.id, input.id),
              eq(verbPreset.ownerType, owner.ownerType),
              eq(verbPreset.ownerId, owner.ownerId),
            ),
          )
          .returning();
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Preset not found" });
        return toPublic(row);
      } catch (err) {
        if (isUniqueViolationOnConstraint(err, NAME_CONSTRAINT)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A preset with this name already exists",
          });
        }
        throw err;
      }
    }),

  remove: protectedProcedure.input(removeInput).mutation(async ({ ctx, input }) => {
    const owner = await resolveOwnerContext(ctx.session);
    assertWriteRole(owner, "Removing a preset");
    const result = await db
      .delete(verbPreset)
      .where(
        and(
          eq(verbPreset.id, input.id),
          eq(verbPreset.ownerType, owner.ownerType),
          eq(verbPreset.ownerId, owner.ownerId),
        ),
      )
      .returning({ id: verbPreset.id });
    if (result.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Preset not found" });
    }
    return { ok: true as const };
  }),
});
