import type { Verb } from "@/server/verbs";

export type ResourceKind =
  | "projects"
  | "boards"
  | "tasks"
  | "comments"
  | "members"
  | "custom_fields"
  | "time_entries";

export type RouteParams = {
  projectId?: string;
  boardId?: string;
};

export type RouteEntry = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  pattern: RegExp;
  resource: ResourceKind;
  verb: Verb;
  /** Pull projectId/boardId out of the matched URL for future scope checks. */
  extractParams: (match: RegExpMatchArray, search: URLSearchParams) => RouteParams;
  flags?: {
    /** List endpoint that supports the visibility (assignee) filter injection. */
    listEndpoint?: boolean;
    /** Write endpoint that supports the author rewrite when authorRewrite is on. */
    authorRewritable?: boolean;
  };
};

export type RouteMatch = {
  entry: RouteEntry;
  params: RouteParams;
};

export type AuthedRequest = {
  subKeyId: string;
  /** First 8 chars of the cuid — safe to log. */
  subKeyShortId: string;
  workspaceId: string;
  verbs: readonly string[];
  scopeProjects: readonly string[];
  scopeBoards: readonly string[];
  boundWeeekUserId: string | null;
  visibilityBound: boolean;
  authorRewrite: boolean;
  masterKey: string;
};

export type ProxyErrorCode =
  | "unauthenticated"
  | "verb_missing"
  | "project_not_in_scope"
  | "board_not_in_scope"
  | "unknown_route"
  | "body_too_large"
  | "rate_limited"
  | "upstream_error"
  | "internal_error";

export type ProxyDecision =
  | { allowed: true }
  | { allowed: false; code: Extract<ProxyErrorCode, "verb_missing" | "project_not_in_scope" | "board_not_in_scope">; message: string };
