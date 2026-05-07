import type { RouteEntry, RouteMatch } from "./types";

const ID = "([^/]+)";

const empty = (): Record<string, never> => ({});

const fromQuery = (keys: ReadonlyArray<"projectId" | "boardId">) =>
  (_: RegExpMatchArray, search: URLSearchParams) => {
    const out: Record<string, string> = {};
    for (const k of keys) {
      const v = search.get(k);
      if (v) out[k] = v;
    }
    return out;
  };

// Route table matches Weeek public API v1: https://api.weeek.net/public/v1
// - Task Manager resources live under /tm/*
// - Workspace-level resources live under /ws/*
// Comments are not exposed in the public API; verb dropped from catalogue.
export const ROUTE_TABLE: readonly RouteEntry[] = [
  // --- Projects ---
  {
    method: "GET",
    pattern: new RegExp(`^/tm/projects$`),
    resource: "projects",
    verb: "projects:read",
    extractParams: empty,
  },
  {
    method: "GET",
    pattern: new RegExp(`^/tm/projects/${ID}$`),
    resource: "projects",
    verb: "projects:read",
    extractParams: (m) => ({ projectId: m[1] ?? "" }),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/tm/projects$`),
    resource: "projects",
    verb: "projects:write",
    extractParams: empty,
  },
  {
    method: "PUT",
    pattern: new RegExp(`^/tm/projects/${ID}$`),
    resource: "projects",
    verb: "projects:write",
    extractParams: (m) => ({ projectId: m[1] ?? "" }),
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^/tm/projects/${ID}$`),
    resource: "projects",
    verb: "projects:delete",
    extractParams: (m) => ({ projectId: m[1] ?? "" }),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/tm/projects/${ID}/archive$`),
    resource: "projects",
    verb: "projects:write",
    extractParams: (m) => ({ projectId: m[1] ?? "" }),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/tm/projects/${ID}/un-archive$`),
    resource: "projects",
    verb: "projects:write",
    extractParams: (m) => ({ projectId: m[1] ?? "" }),
  },

  // --- Boards ---
  {
    method: "GET",
    pattern: new RegExp(`^/tm/boards$`),
    resource: "boards",
    verb: "boards:read",
    extractParams: fromQuery(["projectId"]),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/tm/boards$`),
    resource: "boards",
    verb: "boards:write",
    extractParams: fromQuery(["projectId"]),
  },
  {
    method: "PUT",
    pattern: new RegExp(`^/tm/boards/${ID}$`),
    resource: "boards",
    verb: "boards:write",
    extractParams: (m) => ({ boardId: m[1] ?? "" }),
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^/tm/boards/${ID}$`),
    resource: "boards",
    verb: "boards:delete",
    extractParams: (m) => ({ boardId: m[1] ?? "" }),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/tm/boards/${ID}/move$`),
    resource: "boards",
    verb: "boards:write",
    extractParams: (m) => ({ boardId: m[1] ?? "" }),
  },

  // --- Tasks ---
  {
    method: "GET",
    pattern: new RegExp(`^/tm/tasks$`),
    resource: "tasks",
    verb: "tasks:read",
    extractParams: fromQuery(["projectId", "boardId"]),
    flags: { listEndpoint: true },
  },
  {
    method: "GET",
    pattern: new RegExp(`^/tm/tasks/${ID}$`),
    resource: "tasks",
    verb: "tasks:read",
    extractParams: () => ({}),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/tm/tasks$`),
    resource: "tasks",
    verb: "tasks:write",
    extractParams: fromQuery(["projectId", "boardId"]),
    flags: { authorRewritable: true },
  },
  {
    method: "PUT",
    pattern: new RegExp(`^/tm/tasks/${ID}$`),
    resource: "tasks",
    verb: "tasks:write",
    extractParams: () => ({}),
    flags: { authorRewritable: true },
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^/tm/tasks/${ID}$`),
    resource: "tasks",
    verb: "tasks:delete",
    extractParams: () => ({}),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/tm/tasks/${ID}/complete$`),
    resource: "tasks",
    verb: "tasks:complete",
    extractParams: () => ({}),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/tm/tasks/${ID}/un-complete$`),
    resource: "tasks",
    verb: "tasks:complete",
    extractParams: () => ({}),
  },
  // tasks:move covers both "change board" (POST /tm/tasks/{id}/board) and
  // "change column within a board" (POST /tm/tasks/{id}/board-column) per spec.
  {
    method: "POST",
    pattern: new RegExp(`^/tm/tasks/${ID}/board$`),
    resource: "tasks",
    verb: "tasks:move",
    extractParams: () => ({}),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/tm/tasks/${ID}/board-column$`),
    resource: "tasks",
    verb: "tasks:move",
    extractParams: () => ({}),
  },

  // --- Members (workspace-level) ---
  {
    method: "GET",
    pattern: new RegExp(`^/ws/members$`),
    resource: "members",
    verb: "members:read",
    extractParams: empty,
  },

  // --- Custom fields (TM-level top, plus board/project-scoped variants) ---
  {
    method: "GET",
    pattern: new RegExp(`^/tm/custom-fields$`),
    resource: "custom_fields",
    verb: "custom_fields:read",
    extractParams: empty,
  },
  {
    method: "POST",
    pattern: new RegExp(`^/tm/custom-fields$`),
    resource: "custom_fields",
    verb: "custom_fields:write",
    extractParams: empty,
  },
  {
    method: "PUT",
    pattern: new RegExp(`^/tm/custom-fields/${ID}$`),
    resource: "custom_fields",
    verb: "custom_fields:write",
    extractParams: empty,
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^/tm/custom-fields/${ID}$`),
    resource: "custom_fields",
    verb: "custom_fields:write",
    extractParams: empty,
  },

  // --- Time entries (nested under tasks per Weeek API) ---
  {
    method: "POST",
    pattern: new RegExp(`^/tm/tasks/${ID}/time-entries$`),
    resource: "time_entries",
    verb: "time_entries:write",
    extractParams: () => ({}),
  },
  {
    method: "PUT",
    pattern: new RegExp(`^/tm/tasks/${ID}/time-entries/${ID}$`),
    resource: "time_entries",
    verb: "time_entries:write",
    extractParams: () => ({}),
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^/tm/tasks/${ID}/time-entries/${ID}$`),
    resource: "time_entries",
    verb: "time_entries:delete",
    extractParams: () => ({}),
  },
];

export function matchRoute(
  method: string,
  pathname: string,
  search: URLSearchParams,
): RouteMatch | null {
  for (const entry of ROUTE_TABLE) {
    if (entry.method !== method) continue;
    const m = pathname.match(entry.pattern);
    if (!m) continue;
    return { entry, params: entry.extractParams(m, search) };
  }
  return null;
}
