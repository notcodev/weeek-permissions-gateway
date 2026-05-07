import type { AuthedRequest, ProxyDecision, RouteMatch } from "./types";

function inScope(scope: readonly string[], id: string | undefined): boolean {
  if (!id) return true;
  if (scope.includes("*")) return true;
  return scope.includes(id);
}

export function evaluate(match: RouteMatch, sub: AuthedRequest): ProxyDecision {
  const { entry, params } = match;

  if (!sub.verbs.includes(entry.verb)) {
    return {
      allowed: false,
      code: "verb_missing",
      message: `Verb ${entry.verb} is not granted to this sub-key`,
    };
  }

  if (!inScope(sub.scopeProjects, params.projectId)) {
    return {
      allowed: false,
      code: "project_not_in_scope",
      message: `Project ${params.projectId} is outside this sub-key's scope`,
    };
  }

  if (!inScope(sub.scopeBoards, params.boardId)) {
    return {
      allowed: false,
      code: "board_not_in_scope",
      message: `Board ${params.boardId} is outside this sub-key's scope`,
    };
  }

  return { allowed: true };
}
