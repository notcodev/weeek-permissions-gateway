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

export const ROUTE_TABLE: readonly RouteEntry[] = [
  // Projects
  {
    method: "GET",
    pattern: new RegExp(`^/ws/projects$`),
    resource: "projects",
    verb: "projects:read",
    extractParams: empty,
  },
  {
    method: "GET",
    pattern: new RegExp(`^/ws/projects/${ID}$`),
    resource: "projects",
    verb: "projects:read",
    extractParams: (m) => ({ projectId: m[1] ?? "" }),
  },
  // Boards
  {
    method: "GET",
    pattern: new RegExp(`^/ws/boards$`),
    resource: "boards",
    verb: "boards:read",
    extractParams: fromQuery(["projectId"]),
  },
  {
    method: "GET",
    pattern: new RegExp(`^/ws/boards/${ID}$`),
    resource: "boards",
    verb: "boards:read",
    extractParams: (m) => ({ boardId: m[1] ?? "" }),
  },
  // Tasks
  {
    method: "GET",
    pattern: new RegExp(`^/ws/tasks$`),
    resource: "tasks",
    verb: "tasks:read",
    extractParams: fromQuery(["projectId", "boardId"]),
    flags: { listEndpoint: true },
  },
  {
    method: "GET",
    pattern: new RegExp(`^/ws/tasks/${ID}$`),
    resource: "tasks",
    verb: "tasks:read",
    extractParams: () => ({}),
  },
  // Comments
  {
    method: "GET",
    pattern: new RegExp(`^/ws/tasks/${ID}/comments$`),
    resource: "comments",
    verb: "comments:read",
    extractParams: () => ({}),
    flags: { listEndpoint: true },
  },
  // Members
  {
    method: "GET",
    pattern: new RegExp(`^/ws/members$`),
    resource: "members",
    verb: "members:read",
    extractParams: empty,
  },
  // Custom fields
  {
    method: "GET",
    pattern: new RegExp(`^/ws/custom-fields$`),
    resource: "custom_fields",
    verb: "custom_fields:read",
    extractParams: empty,
  },
  // Time entries
  {
    method: "GET",
    pattern: new RegExp(`^/ws/time-entries$`),
    resource: "time_entries",
    verb: "time_entries:read",
    extractParams: fromQuery(["projectId"]),
    flags: { listEndpoint: true },
  },

  // --- Phase 5a write/delete entries ---
  // TODO(verify): confirm exact paths/methods against Weeek's live API docs.
  // Defaults below assume standard REST conventions.

  // Projects
  {
    method: "POST",
    pattern: new RegExp(`^/ws/projects$`),
    resource: "projects",
    verb: "projects:write",
    extractParams: empty,
  },
  {
    method: "PATCH",
    pattern: new RegExp(`^/ws/projects/${ID}$`),
    resource: "projects",
    verb: "projects:write",
    extractParams: (m) => ({ projectId: m[1] ?? "" }),
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^/ws/projects/${ID}$`),
    resource: "projects",
    verb: "projects:delete",
    extractParams: (m) => ({ projectId: m[1] ?? "" }),
  },

  // Boards
  {
    method: "POST",
    pattern: new RegExp(`^/ws/boards$`),
    resource: "boards",
    verb: "boards:write",
    extractParams: fromQuery(["projectId"]),
  },
  {
    method: "PATCH",
    pattern: new RegExp(`^/ws/boards/${ID}$`),
    resource: "boards",
    verb: "boards:write",
    extractParams: (m) => ({ boardId: m[1] ?? "" }),
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^/ws/boards/${ID}$`),
    resource: "boards",
    verb: "boards:delete",
    extractParams: (m) => ({ boardId: m[1] ?? "" }),
  },

  // Tasks
  {
    method: "POST",
    pattern: new RegExp(`^/ws/tasks$`),
    resource: "tasks",
    verb: "tasks:write",
    extractParams: fromQuery(["projectId", "boardId"]),
    flags: { authorRewritable: true },
  },
  {
    method: "PATCH",
    pattern: new RegExp(`^/ws/tasks/${ID}$`),
    resource: "tasks",
    verb: "tasks:write",
    extractParams: () => ({}),
    flags: { authorRewritable: true },
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^/ws/tasks/${ID}$`),
    resource: "tasks",
    verb: "tasks:delete",
    extractParams: () => ({}),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/ws/tasks/${ID}/complete$`),
    resource: "tasks",
    verb: "tasks:complete",
    extractParams: () => ({}),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/ws/tasks/${ID}/move$`),
    resource: "tasks",
    verb: "tasks:move",
    extractParams: () => ({}),
  },

  // Comments
  {
    method: "POST",
    pattern: new RegExp(`^/ws/tasks/${ID}/comments$`),
    resource: "comments",
    verb: "comments:write",
    extractParams: () => ({}),
    flags: { authorRewritable: true },
  },
  {
    method: "PATCH",
    pattern: new RegExp(`^/ws/tasks/${ID}/comments/${ID}$`),
    resource: "comments",
    verb: "comments:write",
    extractParams: () => ({}),
    flags: { authorRewritable: true },
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^/ws/tasks/${ID}/comments/${ID}$`),
    resource: "comments",
    verb: "comments:delete",
    extractParams: () => ({}),
  },

  // Custom fields
  {
    method: "POST",
    pattern: new RegExp(`^/ws/custom-fields$`),
    resource: "custom_fields",
    verb: "custom_fields:write",
    extractParams: empty,
  },
  {
    method: "PATCH",
    pattern: new RegExp(`^/ws/custom-fields/${ID}$`),
    resource: "custom_fields",
    verb: "custom_fields:write",
    extractParams: empty,
  },

  // Time entries (write/delete)
  {
    method: "POST",
    pattern: new RegExp(`^/ws/time-entries$`),
    resource: "time_entries",
    verb: "time_entries:write",
    extractParams: fromQuery(["projectId"]),
  },
  {
    method: "PATCH",
    pattern: new RegExp(`^/ws/time-entries/${ID}$`),
    resource: "time_entries",
    verb: "time_entries:write",
    extractParams: empty,
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^/ws/time-entries/${ID}$`),
    resource: "time_entries",
    verb: "time_entries:delete",
    extractParams: empty,
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
