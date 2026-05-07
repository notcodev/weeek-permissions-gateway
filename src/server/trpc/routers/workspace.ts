import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { db } from "@/server/db/client";
import { weeekWorkspace } from "@/server/db/schema/workspace";
import { encrypt } from "@/server/crypto/aesGcm";
import { fingerprint, last4 } from "@/server/crypto/fingerprint";
import { validateMasterKey } from "@/server/weeek/client";
import { WeeekValidationError } from "@/server/weeek/errors";
import { assertWriteRole, resolveOwnerContext } from "../ownerContext";
import { protectedProcedure, router } from "../init";

const importInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  masterKey: z
    .string()
    .trim()
    .min(8, "Master key looks too short")
    .max(2000, "Master key is unreasonably long"),
});

const removeInput = z.object({ id: z.string().min(1) });

export type WorkspacePublic = {
  id: string;
  name: string;
  ownerType: "user" | "organization";
  ownerId: string;
  weeekWorkspaceId: string | null;
  masterKeyLast4: string;
  encVersion: number;
  lastVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toPublic(row: typeof weeekWorkspace.$inferSelect): WorkspacePublic {
  return {
    id: row.id,
    name: row.name,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    weeekWorkspaceId: row.weeekWorkspaceId,
    masterKeyLast4: row.masterKeyLast4,
    encVersion: row.encVersion,
    lastVerifiedAt: row.lastVerifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const workspaceRouter = router({
  list: protectedProcedure.query(async ({ ctx }): Promise<WorkspacePublic[]> => {
    const owner = await resolveOwnerContext(ctx.session);
    const rows = await db
      .select()
      .from(weeekWorkspace)
      .where(
        and(eq(weeekWorkspace.ownerType, owner.ownerType), eq(weeekWorkspace.ownerId, owner.ownerId)),
      )
      .orderBy(desc(weeekWorkspace.createdAt));
    return rows.map(toPublic);
  }),

  import: protectedProcedure
    .input(importInput)
    .mutation(async ({ ctx, input }): Promise<WorkspacePublic> => {
      const owner = await resolveOwnerContext(ctx.session);
      assertWriteRole(owner, "Importing a workspace");
      const { ownerType, ownerId } = owner;

      try {
        await validateMasterKey(input.masterKey);
      } catch (err) {
        if (err instanceof WeeekValidationError) {
          if (err.reason === "unauthorized") {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Weeek rejected this master key. Double-check the token in Weeek settings.",
            });
          }
          if (err.reason === "upstream_5xx" || err.reason === "network") {
            throw new TRPCError({
              code: "BAD_GATEWAY",
              message: "Could not reach Weeek to validate the key. Try again in a moment.",
            });
          }
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Validation failed" });
      }

      const env = await encrypt(input.masterKey);
      const fp = fingerprint(input.masterKey);
      const tail = last4(input.masterKey);

      const id = createId();
      const now = new Date();

      try {
        const [row] = await db
          .insert(weeekWorkspace)
          .values({
            id,
            ownerType,
            ownerId,
            name: input.name,
            weeekWorkspaceId: null,
            masterKeyCiphertext: env.ciphertext,
            masterKeyIv: env.iv,
            masterKeyTag: env.tag,
            masterKeyLast4: tail,
            masterKeyFingerprint: fp,
            encVersion: env.encVersion,
            lastVerifiedAt: now,
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
        if (isUniqueViolationOnConstraint(err, FINGERPRINT_CONSTRAINT)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This master key is already imported into your account.",
          });
        }
        throw err;
      }
    }),

  remove: protectedProcedure.input(removeInput).mutation(async ({ ctx, input }) => {
    const owner = await resolveOwnerContext(ctx.session);
    assertWriteRole(owner, "Removing a workspace");
    const result = await db
      .delete(weeekWorkspace)
      .where(
        and(
          eq(weeekWorkspace.id, input.id),
          eq(weeekWorkspace.ownerType, owner.ownerType),
          eq(weeekWorkspace.ownerId, owner.ownerId),
        ),
      )
      .returning({ id: weeekWorkspace.id });
    if (result.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
    }
    return { ok: true as const };
  }),
});

const FINGERPRINT_CONSTRAINT = "weeek_workspace_owner_fingerprint_uq";

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
