import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { db } from "@/server/db/client";
import { subKey } from "@/server/db/schema/subKey";
import { weeekWorkspace } from "@/server/db/schema/workspace";
import { generateRawSubKey, hashSubKey, RAW_KEY_PREFIX, subKeyLast4 } from "@/server/crypto/subKey";
import { expandPreset, PRESET_KEYS } from "@/server/verbs";
import { protectedProcedure, router } from "../init";

const presetEnum = z.enum(PRESET_KEYS);

const listInput = z.object({ workspaceId: z.string().min(1) });
const createInput = z.object({
  workspaceId: z.string().min(1),
  label: z.string().trim().min(1, "Label is required").max(80),
  preset: presetEnum,
});
const revokeInput = z.object({ id: z.string().min(1) });
const getInput = z.object({ id: z.string().min(1) });

export type SubKeyPublic = {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  label: string;
  prefix: string;
  last4: string;
  status: "active" | "revoked";
  revokedAt: Date | null;
  revokedByUserId: string | null;
  boundWeeekUserId: string | null;
  boundWeeekUserName: string | null;
  visibilityBound: boolean;
  authorRewrite: boolean;
  scopeProjects: string[];
  scopeBoards: string[];
  verbs: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  useCount: number;
};

function toPublic(row: typeof subKey.$inferSelect): SubKeyPublic {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    createdByUserId: row.createdByUserId,
    label: row.label,
    prefix: row.prefix,
    last4: row.last4,
    status: row.status,
    revokedAt: row.revokedAt,
    revokedByUserId: row.revokedByUserId,
    boundWeeekUserId: row.boundWeeekUserId,
    boundWeeekUserName: row.boundWeeekUserName,
    visibilityBound: row.visibilityBound,
    authorRewrite: row.authorRewrite,
    scopeProjects: row.scopeProjects,
    scopeBoards: row.scopeBoards,
    verbs: row.verbs,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    useCount: row.useCount,
  };
}

async function findOwnedWorkspaceId(workspaceId: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: weeekWorkspace.id })
    .from(weeekWorkspace)
    .where(
      and(
        eq(weeekWorkspace.id, workspaceId),
        eq(weeekWorkspace.ownerType, "user"),
        eq(weeekWorkspace.ownerId, userId),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

export const subKeyRouter = router({
  listForWorkspace: protectedProcedure
    .input(listInput)
    .query(async ({ ctx, input }): Promise<SubKeyPublic[]> => {
      const owned = await findOwnedWorkspaceId(input.workspaceId, ctx.session.user.id);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });

      const rows = await db
        .select()
        .from(subKey)
        .where(eq(subKey.workspaceId, owned))
        .orderBy(desc(subKey.createdAt));
      return rows.map(toPublic);
    }),

  create: protectedProcedure
    .input(createInput)
    .mutation(async ({ ctx, input }): Promise<{ subKey: SubKeyPublic; rawKey: string }> => {
      const owned = await findOwnedWorkspaceId(input.workspaceId, ctx.session.user.id);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });

      const rawKey = generateRawSubKey();
      const hash = hashSubKey(rawKey);
      const last4 = subKeyLast4(rawKey);
      const verbs = [...expandPreset(input.preset)];

      const id = createId();
      const now = new Date();

      const [row] = await db
        .insert(subKey)
        .values({
          id,
          workspaceId: owned,
          createdByUserId: ctx.session.user.id,
          label: input.label,
          prefix: RAW_KEY_PREFIX,
          hash,
          last4,
          status: "active",
          // TODO(phase-5): accept scope_projects/scope_boards from the wizard
          // once project/board pickers ship. Until then everything is unscoped
          // and the proxy's scope check trivially allows.
          scopeProjects: ["*"],
          scopeBoards: ["*"],
          verbs,
          createdAt: now,
        })
        .returning();
      if (!row)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Insert returned no row" });
      return { subKey: toPublic(row), rawKey };
    }),

  revoke: protectedProcedure.input(revokeInput).mutation(async ({ ctx, input }) => {
    const result = await db
      .update(subKey)
      .set({
        status: "revoked",
        revokedAt: new Date(),
        revokedByUserId: ctx.session.user.id,
      })
      .where(
        and(
          eq(subKey.id, input.id),
          eq(subKey.status, "active"),
          inArray(
            subKey.workspaceId,
            db
              .select({ id: weeekWorkspace.id })
              .from(weeekWorkspace)
              .where(
                and(
                  eq(weeekWorkspace.ownerType, "user"),
                  eq(weeekWorkspace.ownerId, ctx.session.user.id),
                ),
              ),
          ),
        ),
      )
      .returning({ id: subKey.id });

    if (result.length > 0) {
      return { ok: true as const };
    }

    // Either: not owned (NOT_FOUND) OR already revoked (idempotent).
    const [existing] = await db
      .select({ id: subKey.id, status: subKey.status })
      .from(subKey)
      .innerJoin(weeekWorkspace, eq(weeekWorkspace.id, subKey.workspaceId))
      .where(
        and(
          eq(subKey.id, input.id),
          eq(weeekWorkspace.ownerType, "user"),
          eq(weeekWorkspace.ownerId, ctx.session.user.id),
        ),
      )
      .limit(1);

    if (existing?.status === "revoked") return { ok: true as const };
    throw new TRPCError({ code: "NOT_FOUND", message: "Sub-key not found" });
  }),

  get: protectedProcedure.input(getInput).query(async ({ ctx, input }): Promise<SubKeyPublic> => {
    const [row] = await db
      .select()
      .from(subKey)
      .where(
        and(
          eq(subKey.id, input.id),
          inArray(
            subKey.workspaceId,
            db
              .select({ id: weeekWorkspace.id })
              .from(weeekWorkspace)
              .where(
                and(
                  eq(weeekWorkspace.ownerType, "user"),
                  eq(weeekWorkspace.ownerId, ctx.session.user.id),
                ),
              ),
          ),
        ),
      )
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Sub-key not found" });
    return toPublic(row);
  }),
});
