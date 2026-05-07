import { randomUUID } from "node:crypto";
import { logger } from "@/server/logger";
import { authenticateBearer } from "./auth";
import { recordUsage } from "./audit";
import { errorResponse } from "./errors";
import { forward } from "./forward";
import { evaluate } from "./policyEval";
import { matchRoute } from "./routeTable";

const STATUS_FOR_DENY = {
  verb_missing: 403,
  project_not_in_scope: 403,
  board_not_in_scope: 403,
} as const;

export async function proxy(req: Request): Promise<Response> {
  const requestId = randomUUID();
  const url = new URL(req.url);
  // Strip the /api/v1 prefix; the route table is keyed off Weeek's `/ws/*` paths.
  const proxiedPath = url.pathname.replace(/^\/api\/v1/, "");
  const search = url.search;
  const method = req.method.toUpperCase();
  const log = logger.child({ requestId, method, path: proxiedPath });

  // 1. Auth
  const auth = await authenticateBearer(req);
  if (auth.kind !== "ok") {
    log.info({ ourStatus: 401, denyReason: auth.code }, "proxy denied");
    return errorResponse({
      code: auth.code,
      status: 401,
      message: auth.message,
      requestId,
    });
  }
  const authed = auth.authed;

  // 2. Route resolution
  const match = matchRoute(method, proxiedPath, url.searchParams);
  if (!match) {
    log.info(
      { ourStatus: 403, denyReason: "unknown_route", subKeyId: authed.subKeyShortId },
      "proxy denied",
    );
    return errorResponse({
      code: "unknown_route",
      status: 403,
      message: `No route table entry for ${method} ${proxiedPath}`,
      subKeyId: authed.subKeyShortId,
      requestId,
    });
  }

  // 3. Policy
  const decision = evaluate(match, authed);
  if (!decision.allowed) {
    log.info(
      { ourStatus: 403, denyReason: decision.code, subKeyId: authed.subKeyShortId },
      "proxy denied",
    );
    return errorResponse({
      code: decision.code,
      status: STATUS_FOR_DENY[decision.code],
      message: decision.message,
      subKeyId: authed.subKeyShortId,
      requestId,
    });
  }

  // 4. Forward
  const upstream = await forward({
    masterKey: authed.masterKey,
    pathname: proxiedPath,
    search,
    method,
    headers: req.headers,
    body: req.body,
    requestId,
    subKeyId: authed.subKeyShortId,
  });

  // 5. Audit (fire-and-forget — never blocks the response).
  void recordUsage(authed.subKeyId);

  // Read and strip the internal marker set by forward() to distinguish
  // the actual upstream status from our synthesised status (e.g. synth-502).
  const upstreamStatus = upstream.headers.get("x-proxy-upstream-status") ?? "unknown";
  upstream.headers.delete("x-proxy-upstream-status");

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
