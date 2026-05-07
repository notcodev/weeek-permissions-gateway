import { randomUUID } from "node:crypto";
import { logger } from "@/server/logger";
import { authenticateBearer } from "./auth";
import { recordAudit, recordUsage } from "./audit";
import { errorResponse } from "./errors";
import { forward } from "./forward";
import { evaluate } from "./policyEval";
import { applyVisibilityFilter, rewriteAuthor } from "./rewrites";
import { matchRoute } from "./routeTable";
import type { AuthedRequest } from "./types";

const STATUS_FOR_DENY = {
  verb_missing: 403,
  project_not_in_scope: 403,
  board_not_in_scope: 403,
} as const;

type AuditMeta = {
  workspaceId: string;
  subKeyId: string | null;
  verb: string | null;
};

export async function proxy(req: Request): Promise<Response> {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const url = new URL(req.url);
  // Strip the /api/v1 prefix; the route table is keyed off Weeek's `/tm/*` and `/ws/*` paths.
  const proxiedPath = url.pathname.replace(/^\/api\/v1/, "");
  const originalQuery = url.search === "" ? null : url.search;
  const method = req.method.toUpperCase();
  const forwardedFor = req.headers.get("x-forwarded-for");
  const userAgent = req.headers.get("user-agent");
  const log = logger.child({ requestId, method, path: proxiedPath });

  function fireAudit(
    meta: AuditMeta,
    res: Response,
    upstreamStatus: string,
    denyReason: string | null,
  ) {
    void recordAudit({
      workspaceId: meta.workspaceId,
      subKeyId: meta.subKeyId,
      requestId,
      method,
      path: proxiedPath,
      query: originalQuery,
      ourStatus: res.status,
      upstreamStatus,
      latencyMs: Date.now() - startedAt,
      verb: meta.verb,
      denyReason,
      forwardedFor,
      userAgent,
    });
  }

  // 1. Auth — pre-auth denies have no workspace context, so they only land
  // in pino logs (the per-workspace audit_log can't reference them).
  const auth = await authenticateBearer(req);
  if (auth.kind !== "ok") {
    log.info({ ourStatus: 401, denyReason: auth.code, latencyMs: Date.now() - startedAt }, "proxy denied");
    return errorResponse({
      code: auth.code,
      status: 401,
      message: auth.message,
      requestId,
    });
  }
  const authed: AuthedRequest = auth.authed;

  // 2. Route resolution
  const match = matchRoute(method, proxiedPath, url.searchParams);
  if (!match) {
    const res = errorResponse({
      code: "unknown_route",
      status: 403,
      message: `No route table entry for ${method} ${proxiedPath}`,
      subKeyId: authed.subKeyShortId,
      requestId,
    });
    log.info(
      { ourStatus: 403, denyReason: "unknown_route", subKeyId: authed.subKeyShortId },
      "proxy denied",
    );
    fireAudit(
      { workspaceId: authed.workspaceId, subKeyId: authed.subKeyId, verb: null },
      res,
      "n/a",
      "unknown_route",
    );
    return res;
  }

  // 3. Policy
  const decision = evaluate(match, authed);
  if (!decision.allowed) {
    const res = errorResponse({
      code: decision.code,
      status: STATUS_FOR_DENY[decision.code],
      message: decision.message,
      subKeyId: authed.subKeyShortId,
      requestId,
    });
    log.info(
      { ourStatus: res.status, denyReason: decision.code, subKeyId: authed.subKeyShortId },
      "proxy denied",
    );
    fireAudit(
      { workspaceId: authed.workspaceId, subKeyId: authed.subKeyId, verb: match.entry.verb },
      res,
      "n/a",
      decision.code,
    );
    return res;
  }

  // 4a. Rewrites — visibility filter (mutates url query in place).
  applyVisibilityFilter(url, match, authed);

  // 4b. Rewrites — author rewrite. Only consume the body when the rewrite is
  // actually live; reads keep their streamed body for everything else.
  let outboundBody: BodyInit | null = req.body;
  if (
    match.entry.flags?.authorRewritable &&
    authed.authorRewrite &&
    authed.boundWeeekUserId
  ) {
    const text = await req.text();
    const rewritten = await rewriteAuthor(
      text === "" ? null : text,
      req.headers.get("content-type"),
      match,
      authed,
    );
    outboundBody = rewritten.body;
  }

  // 5. Forward
  const upstream = await forward({
    masterKey: authed.masterKey,
    pathname: proxiedPath,
    search: url.search,
    method,
    headers: req.headers,
    body: outboundBody,
    requestId,
    subKeyId: authed.subKeyShortId,
  });

  // 6. Audit (fire-and-forget — never blocks the response).
  void recordUsage(authed.subKeyId);

  // Read and strip the internal marker set by forward() to distinguish
  // the actual upstream status from our synthesised status (e.g. synth-502).
  const upstreamStatus = upstream.headers.get("x-proxy-upstream-status") ?? "unknown";
  upstream.headers.delete("x-proxy-upstream-status");

  fireAudit(
    { workspaceId: authed.workspaceId, subKeyId: authed.subKeyId, verb: match.entry.verb },
    upstream,
    upstreamStatus,
    null,
  );

  log.info(
    {
      ourStatus: upstream.status,
      upstreamStatus,
      subKeyId: authed.subKeyShortId,
      verb: match.entry.verb,
    },
    "proxy forwarded",
  );

  return upstream;
}
