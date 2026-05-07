import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { member } from "@/server/db/schema/org";
import type { TRPCContext } from "./init";

export type OwnerContext =
  | { ownerType: "user"; ownerId: string; role: null }
  | { ownerType: "organization"; ownerId: string; role: "owner" | "admin" | "member" };

export const WRITE_ROLES = ["owner", "admin"] as const;
export type WriteRole = (typeof WRITE_ROLES)[number];

/**
 * Resolves the active owner context from a tRPC session. When the session has
 * `activeOrganizationId`, the user is operating in that org's context — we
 * verify they're still a member (Better Auth should already enforce this on
 * setActive, but defence in depth) and return the org context with their role.
 * Otherwise we fall back to the user's personal context.
 */
export async function resolveOwnerContext(
  session: NonNullable<TRPCContext["session"]>,
): Promise<OwnerContext> {
  const userId = session.user.id;
  const sessionRow = (session as { session?: { activeOrganizationId?: string | null } }).session;
  const activeOrgId = sessionRow?.activeOrganizationId ?? null;

  if (!activeOrgId) {
    return { ownerType: "user", ownerId: userId, role: null };
  }

  const [m] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, activeOrgId), eq(member.userId, userId)))
    .limit(1);

  if (!m) {
    // The session has a stale active-org pointer (user removed from the org
    // mid-session, or set-active raced with a removal). Treat as a hard error
    // rather than silently falling back to user context — that would let the
    // user accidentally write to their personal scope when the UI is showing
    // the org dashboard.
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No longer a member of the active organization",
    });
  }

  const role = (m.role as "owner" | "admin" | "member" | string) || "member";
  if (role !== "owner" && role !== "admin" && role !== "member") {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Unexpected role "${role}" on org membership`,
    });
  }
  return { ownerType: "organization", ownerId: activeOrgId, role };
}

/**
 * Throws FORBIDDEN if the active org context's role is not owner/admin.
 * No-op when the context is the personal/user scope (a user always has full
 * authority over their own resources).
 */
export function assertWriteRole(ctx: OwnerContext, action: string): void {
  if (ctx.ownerType === "user") return;
  if ((WRITE_ROLES as readonly string[]).includes(ctx.role)) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: `${action} requires owner or admin role in this organization`,
  });
}
