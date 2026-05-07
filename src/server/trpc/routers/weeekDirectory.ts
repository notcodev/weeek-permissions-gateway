import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { weeekWorkspace } from "@/server/db/schema/workspace";
import { decrypt } from "@/server/crypto/aesGcm";
import { fetchBoards, fetchMembers, fetchProjects } from "@/server/weeek/directory";
import { getOrFetch } from "@/server/weeek/cache";
import { protectedProcedure, router } from "../init";

const TTL_MS = 60_000;

async function loadMasterKey(workspaceId: string, userId: string): Promise<string> {
  const [row] = await db
    .select({
      ciphertext: weeekWorkspace.masterKeyCiphertext,
      iv: weeekWorkspace.masterKeyIv,
      tag: weeekWorkspace.masterKeyTag,
      encVersion: weeekWorkspace.encVersion,
    })
    .from(weeekWorkspace)
    .where(
      and(
        eq(weeekWorkspace.id, workspaceId),
        eq(weeekWorkspace.ownerType, "user"),
        eq(weeekWorkspace.ownerId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
  return decrypt({
    ciphertext: row.ciphertext,
    iv: row.iv,
    tag: row.tag,
    encVersion: row.encVersion,
  });
}

const projectsInput = z.object({ workspaceId: z.string().min(1) });
const boardsInput = z.object({
  workspaceId: z.string().min(1),
  projectId: z.string().min(1).optional(),
});
const membersInput = z.object({ workspaceId: z.string().min(1) });

export const weeekDirectoryRouter = router({
  projects: protectedProcedure.input(projectsInput).query(async ({ ctx, input }) => {
    const masterKey = await loadMasterKey(input.workspaceId, ctx.session.user.id);
    return getOrFetch(`projects:${input.workspaceId}`, TTL_MS, () => fetchProjects(masterKey));
  }),

  boards: protectedProcedure.input(boardsInput).query(async ({ ctx, input }) => {
    const masterKey = await loadMasterKey(input.workspaceId, ctx.session.user.id);
    const cacheKey = `boards:${input.workspaceId}:${input.projectId ?? "*"}`;
    return getOrFetch(cacheKey, TTL_MS, () => fetchBoards(masterKey, input.projectId));
  }),

  members: protectedProcedure.input(membersInput).query(async ({ ctx, input }) => {
    const masterKey = await loadMasterKey(input.workspaceId, ctx.session.user.id);
    return getOrFetch(`members:${input.workspaceId}`, TTL_MS, () => fetchMembers(masterKey));
  }),
});
