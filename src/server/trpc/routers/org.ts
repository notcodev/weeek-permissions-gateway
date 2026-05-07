import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { auth } from "@/server/auth";
import { member, organization } from "@/server/db/schema/org";
import { protectedProcedure, router } from "../init";

// Thin wrappers around Better Auth's organization() plugin. The plugin owns
// the data model (organization/member/invitation tables); these procedures
// expose just the operations we actually want surfaced from the dashboard.
//
// `list` queries our Drizzle tables directly — Better Auth's API alternative
// requires session cookies and we want this callable from server components
// using `appRouter.createCaller({session, headers})` without a round-trip.
//
// All mutating procedures forward to `auth.api.*` so the plugin's role checks
// and invitation lifecycle (expiry, status transitions) stay authoritative.

const ROLE = z.enum(["owner", "admin", "member"]);

const createInput = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "lowercase letters/digits/hyphens only"),
});

const inviteInput = z.object({
  organizationId: z.string().min(1),
  email: z.string().email(),
  role: ROLE.default("member"),
});

const acceptInviteInput = z.object({
  invitationId: z.string().min(1),
});

const removeMemberInput = z.object({
  organizationId: z.string().min(1),
  memberIdOrEmail: z.string().min(1),
});

const leaveInput = z.object({
  organizationId: z.string().min(1),
});

export type OrgPublic = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  role: string;
  createdAt: Date;
};

export const orgRouter = router({
  list: protectedProcedure.query(async ({ ctx }): Promise<OrgPublic[]> => {
    const rows = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        role: member.role,
        createdAt: organization.createdAt,
      })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, ctx.session.user.id))
      .orderBy(asc(organization.name));
    return rows;
  }),

  create: protectedProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    // Use the server-only userId path so this works from tRPC contexts that
    // don't carry real session cookies (e.g. server components that built
    // their session via `auth.api.getSession({headers})`).
    const created = await auth.api.createOrganization({
      body: {
        name: input.name,
        slug: input.slug,
        userId: ctx.session.user.id,
      },
    });
    if (!created) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Org create returned null" });
    }
    return { id: created.id };
  }),

  invite: protectedProcedure.input(inviteInput).mutation(async ({ ctx, input }) => {
    await assertMembership(input.organizationId, ctx.session.user.id, ["owner", "admin"]);
    const inv = await auth.api.createInvitation({
      body: {
        email: input.email,
        role: input.role,
        organizationId: input.organizationId,
      },
      headers: ctx.headers,
    });
    return { id: inv?.id ?? null };
  }),

  acceptInvite: protectedProcedure
    .input(acceptInviteInput)
    .mutation(async ({ ctx, input }) => {
      await auth.api.acceptInvitation({
        body: { invitationId: input.invitationId },
        headers: ctx.headers,
      });
      return { ok: true as const };
    }),

  removeMember: protectedProcedure
    .input(removeMemberInput)
    .mutation(async ({ ctx, input }) => {
      await assertMembership(input.organizationId, ctx.session.user.id, ["owner", "admin"]);
      await auth.api.removeMember({
        body: {
          organizationId: input.organizationId,
          memberIdOrEmail: input.memberIdOrEmail,
        },
        headers: ctx.headers,
      });
      return { ok: true as const };
    }),

  leave: protectedProcedure.input(leaveInput).mutation(async ({ ctx, input }) => {
    await auth.api.leaveOrganization({
      body: { organizationId: input.organizationId },
      headers: ctx.headers,
    });
    return { ok: true as const };
  }),
});

async function assertMembership(
  organizationId: string,
  userId: string,
  rolesAllowed: ReadonlyArray<"owner" | "admin" | "member">,
): Promise<void> {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
  }
  if (!rolesAllowed.includes(row.role as (typeof rolesAllowed)[number])) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient role for this action" });
  }
}
