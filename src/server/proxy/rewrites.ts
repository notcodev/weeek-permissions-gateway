import type { AuthedRequest, RouteMatch } from "./types";

// TODO(verify): confirm against Weeek API docs. Single source of truth for both
// the visibility-filter query param and the author-rewrite body field. Spec §19
// flags both as open questions; phase-5c pins them to "assigneeId" as the most
// likely Weeek field given the validate path uses `/ws/members?limit=1` etc.
const ASSIGNEE_QUERY_PARAM = "assigneeId";
const ASSIGNEE_BODY_FIELD = "assigneeId";

export function applyVisibilityFilter(
  url: URL,
  match: RouteMatch,
  authed: AuthedRequest,
): void {
  if (!authed.visibilityBound) return;
  if (!authed.boundWeeekUserId) return;
  if (!match.entry.flags?.listEndpoint) return;
  if (url.searchParams.has(ASSIGNEE_QUERY_PARAM)) return;
  url.searchParams.set(ASSIGNEE_QUERY_PARAM, authed.boundWeeekUserId);
}

export type RewriteAuthorResult = {
  body: BodyInit | null;
};

export async function rewriteAuthor(
  body: string | null,
  contentType: string | null,
  match: RouteMatch,
  authed: AuthedRequest,
): Promise<RewriteAuthorResult> {
  if (!authed.authorRewrite) return { body };
  if (!authed.boundWeeekUserId) return { body };
  if (!match.entry.flags?.authorRewritable) return { body };
  if (body == null) return { body };
  if (!contentType || !contentType.toLowerCase().includes("application/json")) {
    return { body };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { body };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { body };
  }
  const obj = parsed as Record<string, unknown>;
  if (ASSIGNEE_BODY_FIELD in obj) return { body };
  obj[ASSIGNEE_BODY_FIELD] = authed.boundWeeekUserId;
  return { body: JSON.stringify(obj) };
}
