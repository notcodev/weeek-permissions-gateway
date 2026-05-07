import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { auditLog } from "@/server/db/schema/auditLog";
import { weeekWorkspace } from "@/server/db/schema/workspace";
import { protectedProcedure, router } from "../init";

const DEFAULT_PERIOD_DAYS = 7;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const isoDateString = z.string().refine(
  (s) => !Number.isNaN(Date.parse(s)),
  "must be ISO 8601",
);

const searchInput = z.object({
  workspaceId: z.string().min(1),
  from: isoDateString.optional(),
  to: isoDateString.optional(),
  subKeyId: z.string().min(1).optional(),
  statusMin: z.number().int().min(100).max(599).optional(),
  statusMax: z.number().int().min(100).max(599).optional(),
  denyReason: z.string().min(1).max(64).optional(),
  pathContains: z.string().min(1).max(200).optional(),
  cursor: z
    .object({
      createdAt: isoDateString,
      id: z.string().min(1),
    })
    .optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
});

const statsInput = z.object({
  workspaceId: z.string().min(1),
  from: isoDateString.optional(),
  to: isoDateString.optional(),
});

export type AuditPublic = {
  id: string;
  workspaceId: string;
  subKeyId: string | null;
  requestId: string;
  method: string;
  path: string;
  query: string | null;
  ourStatus: number;
  upstreamStatus: string;
  latencyMs: number;
  verb: string | null;
  denyReason: string | null;
  hasIpHash: boolean;
  userAgent: string | null;
  createdAt: Date;
};

function toPublic(row: typeof auditLog.$inferSelect): AuditPublic {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    subKeyId: row.subKeyId,
    requestId: row.requestId,
    method: row.method,
    path: row.path,
    query: row.query,
    ourStatus: row.ourStatus,
    upstreamStatus: row.upstreamStatus,
    latencyMs: row.latencyMs,
    verb: row.verb,
    denyReason: row.denyReason,
    hasIpHash: row.ipHash !== null,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  };
}

async function assertOwnership(workspaceId: string, userId: string): Promise<void> {
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
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
}

function periodBounds(from?: string, to?: string): { fromDate: Date; toDate: Date } {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from
    ? new Date(from)
    : new Date(toDate.getTime() - DEFAULT_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  return { fromDate, toDate };
}

export const auditRouter = router({
  search: protectedProcedure.input(searchInput).query(async ({ ctx, input }) => {
    await assertOwnership(input.workspaceId, ctx.session.user.id);

    const { fromDate, toDate } = periodBounds(input.from, input.to);
    const limit = input.limit ?? DEFAULT_LIMIT;

    const filters = [
      eq(auditLog.workspaceId, input.workspaceId),
      gte(auditLog.createdAt, fromDate),
      lte(auditLog.createdAt, toDate),
    ];
    if (input.subKeyId) filters.push(eq(auditLog.subKeyId, input.subKeyId));
    if (input.statusMin !== undefined) filters.push(gte(auditLog.ourStatus, input.statusMin));
    if (input.statusMax !== undefined) filters.push(lte(auditLog.ourStatus, input.statusMax));
    if (input.denyReason) filters.push(eq(auditLog.denyReason, input.denyReason));
    if (input.pathContains) filters.push(ilike(auditLog.path, `%${input.pathContains}%`));

    if (input.cursor) {
      const cursorDate = new Date(input.cursor.createdAt);
      // Strict-less than for createdAt OR equal createdAt with id < cursor.id (deterministic order).
      const cursorClause = or(
        lt(auditLog.createdAt, cursorDate),
        and(eq(auditLog.createdAt, cursorDate), lt(auditLog.id, input.cursor.id)),
      );
      if (cursorClause) filters.push(cursorClause);
    }

    // Fetch one extra to compute nextCursor.
    const rows = await db
      .select()
      .from(auditLog)
      .where(and(...filters))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(limit + 1);

    let nextCursor: { createdAt: string; id: string } | null = null;
    if (rows.length > limit) {
      const tail = rows[limit - 1];
      if (tail) nextCursor = { createdAt: tail.createdAt.toISOString(), id: tail.id };
    }
    const items = rows.slice(0, limit).map(toPublic);
    return { items, nextCursor };
  }),

  stats: protectedProcedure.input(statsInput).query(async ({ ctx, input }) => {
    await assertOwnership(input.workspaceId, ctx.session.user.id);
    const { fromDate, toDate } = periodBounds(input.from, input.to);

    const baseFilter = and(
      eq(auditLog.workspaceId, input.workspaceId),
      gte(auditLog.createdAt, fromDate),
      lte(auditLog.createdAt, toDate),
    );

    const [totalRow] = await db
      .select({ total: count() })
      .from(auditLog)
      .where(baseFilter);
    const total = Number(totalRow?.total ?? 0);

    // Status bucket counts via FILTER aggregates in a single round-trip.
    const [bucketRow] = await db
      .select({
        s2xx: sql<number>`count(*) filter (where ${auditLog.ourStatus} >= 200 and ${auditLog.ourStatus} < 300)`,
        s3xx: sql<number>`count(*) filter (where ${auditLog.ourStatus} >= 300 and ${auditLog.ourStatus} < 400)`,
        s4xx: sql<number>`count(*) filter (where ${auditLog.ourStatus} >= 400 and ${auditLog.ourStatus} < 500)`,
        s5xx: sql<number>`count(*) filter (where ${auditLog.ourStatus} >= 500 and ${auditLog.ourStatus} < 600)`,
      })
      .from(auditLog)
      .where(baseFilter);

    const denyRows = await db
      .select({
        denyReason: auditLog.denyReason,
        c: count(),
      })
      .from(auditLog)
      .where(and(baseFilter, sql`${auditLog.denyReason} is not null`))
      .groupBy(auditLog.denyReason)
      .orderBy(asc(auditLog.denyReason));

    const denyBreakdown: Record<string, number> = {};
    for (const r of denyRows) {
      if (r.denyReason) denyBreakdown[r.denyReason] = Number(r.c);
    }

    // Latency percentiles via Postgres percentile_cont. Returns null on empty set.
    const [latencyRow] = await db
      .select({
        p50: sql<number | null>`percentile_cont(0.5) within group (order by ${auditLog.latencyMs})`,
        p95: sql<number | null>`percentile_cont(0.95) within group (order by ${auditLog.latencyMs})`,
      })
      .from(auditLog)
      .where(baseFilter);

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      total,
      statusBuckets: {
        "2xx": Number(bucketRow?.s2xx ?? 0),
        "3xx": Number(bucketRow?.s3xx ?? 0),
        "4xx": Number(bucketRow?.s4xx ?? 0),
        "5xx": Number(bucketRow?.s5xx ?? 0),
      },
      denyBreakdown,
      latencyMs: {
        p50: latencyRow?.p50 == null ? null : Number(latencyRow.p50),
        p95: latencyRow?.p95 == null ? null : Number(latencyRow.p95),
      },
    };
  }),
});
