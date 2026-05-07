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
