import { describe, expect, test } from "vitest";
import { matchRoute, ROUTE_TABLE } from "@/server/proxy/routeTable";

describe("matchRoute", () => {
  test("GET /ws/projects → projects:read with no params", () => {
    const m = matchRoute("GET", "/ws/projects", new URLSearchParams());
    expect(m?.entry.resource).toBe("projects");
    expect(m?.entry.verb).toBe("projects:read");
    expect(m?.params).toEqual({});
  });

  test("GET /ws/projects/42 → projects:read with projectId=42", () => {
    const m = matchRoute("GET", "/ws/projects/42", new URLSearchParams());
    expect(m?.entry.verb).toBe("projects:read");
    expect(m?.params.projectId).toBe("42");
  });

  test("GET /ws/boards → boards:read; projectId comes from query", () => {
    const m = matchRoute("GET", "/ws/boards", new URLSearchParams("projectId=7"));
    expect(m?.entry.verb).toBe("boards:read");
    expect(m?.params.projectId).toBe("7");
  });

  test("GET /ws/boards/123 → boards:read with boardId=123", () => {
    const m = matchRoute("GET", "/ws/boards/123", new URLSearchParams());
    expect(m?.entry.verb).toBe("boards:read");
    expect(m?.params.boardId).toBe("123");
  });

  test("GET /ws/tasks → tasks:read; projectId/boardId from query", () => {
    const m = matchRoute("GET", "/ws/tasks", new URLSearchParams("projectId=9&boardId=4"));
    expect(m?.entry.verb).toBe("tasks:read");
    expect(m?.params).toEqual({ projectId: "9", boardId: "4" });
  });

  test("GET /ws/tasks/abc → tasks:read", () => {
    const m = matchRoute("GET", "/ws/tasks/abc", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:read");
  });

  test("GET /ws/tasks/abc/comments → comments:read", () => {
    const m = matchRoute("GET", "/ws/tasks/abc/comments", new URLSearchParams());
    expect(m?.entry.verb).toBe("comments:read");
  });

  test("GET /ws/members → members:read", () => {
    const m = matchRoute("GET", "/ws/members", new URLSearchParams());
    expect(m?.entry.verb).toBe("members:read");
  });

  test("GET /ws/custom-fields → custom_fields:read", () => {
    const m = matchRoute("GET", "/ws/custom-fields", new URLSearchParams());
    expect(m?.entry.verb).toBe("custom_fields:read");
  });

  test("GET /ws/time-entries → time_entries:read", () => {
    const m = matchRoute("GET", "/ws/time-entries", new URLSearchParams());
    expect(m?.entry.verb).toBe("time_entries:read");
  });

  test("GET /ws/unknown → null", () => {
    const m = matchRoute("GET", "/ws/this-is-not-real", new URLSearchParams());
    expect(m).toBeNull();
  });

  test("GET /not-ws/projects → null (out-of-prefix)", () => {
    const m = matchRoute("GET", "/not-ws/projects", new URLSearchParams());
    expect(m).toBeNull();
  });

  // --- Write verbs (phase 5a) ---

  test("POST /ws/projects → projects:write", () => {
    const m = matchRoute("POST", "/ws/projects", new URLSearchParams());
    expect(m?.entry.verb).toBe("projects:write");
    expect(m?.entry.method).toBe("POST");
  });

  test("PATCH /ws/projects/42 → projects:write with projectId=42", () => {
    const m = matchRoute("PATCH", "/ws/projects/42", new URLSearchParams());
    expect(m?.entry.verb).toBe("projects:write");
    expect(m?.params.projectId).toBe("42");
  });

  test("DELETE /ws/projects/42 → projects:delete", () => {
    const m = matchRoute("DELETE", "/ws/projects/42", new URLSearchParams());
    expect(m?.entry.verb).toBe("projects:delete");
    expect(m?.params.projectId).toBe("42");
  });

  test("POST /ws/boards → boards:write", () => {
    const m = matchRoute("POST", "/ws/boards", new URLSearchParams());
    expect(m?.entry.verb).toBe("boards:write");
  });

  test("PATCH /ws/boards/9 → boards:write", () => {
    const m = matchRoute("PATCH", "/ws/boards/9", new URLSearchParams());
    expect(m?.entry.verb).toBe("boards:write");
    expect(m?.params.boardId).toBe("9");
  });

  test("DELETE /ws/boards/9 → boards:delete", () => {
    const m = matchRoute("DELETE", "/ws/boards/9", new URLSearchParams());
    expect(m?.entry.verb).toBe("boards:delete");
  });

  test("POST /ws/tasks → tasks:write", () => {
    const m = matchRoute("POST", "/ws/tasks", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:write");
  });

  test("PATCH /ws/tasks/abc → tasks:write", () => {
    const m = matchRoute("PATCH", "/ws/tasks/abc", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:write");
  });

  test("DELETE /ws/tasks/abc → tasks:delete", () => {
    const m = matchRoute("DELETE", "/ws/tasks/abc", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:delete");
  });

  test("POST /ws/tasks/abc/complete → tasks:complete", () => {
    const m = matchRoute("POST", "/ws/tasks/abc/complete", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:complete");
  });

  test("POST /ws/tasks/abc/move → tasks:move", () => {
    const m = matchRoute("POST", "/ws/tasks/abc/move", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:move");
  });

  test("POST /ws/tasks/abc/comments → comments:write", () => {
    const m = matchRoute("POST", "/ws/tasks/abc/comments", new URLSearchParams());
    expect(m?.entry.verb).toBe("comments:write");
  });

  test("PATCH /ws/tasks/abc/comments/c1 → comments:write", () => {
    const m = matchRoute("PATCH", "/ws/tasks/abc/comments/c1", new URLSearchParams());
    expect(m?.entry.verb).toBe("comments:write");
  });

  test("DELETE /ws/tasks/abc/comments/c1 → comments:delete", () => {
    const m = matchRoute("DELETE", "/ws/tasks/abc/comments/c1", new URLSearchParams());
    expect(m?.entry.verb).toBe("comments:delete");
  });

  test("POST /ws/custom-fields → custom_fields:write", () => {
    const m = matchRoute("POST", "/ws/custom-fields", new URLSearchParams());
    expect(m?.entry.verb).toBe("custom_fields:write");
  });

  test("PATCH /ws/custom-fields/cf1 → custom_fields:write", () => {
    const m = matchRoute("PATCH", "/ws/custom-fields/cf1", new URLSearchParams());
    expect(m?.entry.verb).toBe("custom_fields:write");
  });

  test("POST /ws/time-entries → time_entries:write", () => {
    const m = matchRoute("POST", "/ws/time-entries", new URLSearchParams());
    expect(m?.entry.verb).toBe("time_entries:write");
  });

  test("PATCH /ws/time-entries/te1 → time_entries:write", () => {
    const m = matchRoute("PATCH", "/ws/time-entries/te1", new URLSearchParams());
    expect(m?.entry.verb).toBe("time_entries:write");
  });

  test("DELETE /ws/time-entries/te1 → time_entries:delete", () => {
    const m = matchRoute("DELETE", "/ws/time-entries/te1", new URLSearchParams());
    expect(m?.entry.verb).toBe("time_entries:delete");
  });

  test("POST /ws/members → null (members are read-only per verb catalogue)", () => {
    const m = matchRoute("POST", "/ws/members", new URLSearchParams());
    expect(m).toBeNull();
  });

  test("DELETE /ws/custom-fields/cf1 → null (no custom_fields:delete verb)", () => {
    const m = matchRoute("DELETE", "/ws/custom-fields/cf1", new URLSearchParams());
    expect(m).toBeNull();
  });

  // --- Phase 5c: route flags ---

  test("GET /ws/tasks is flagged listEndpoint", () => {
    const m = matchRoute("GET", "/ws/tasks", new URLSearchParams());
    expect(m?.entry.flags?.listEndpoint).toBe(true);
  });

  test("GET /ws/tasks/abc is NOT flagged listEndpoint", () => {
    const m = matchRoute("GET", "/ws/tasks/abc", new URLSearchParams());
    expect(m?.entry.flags?.listEndpoint).toBeFalsy();
  });

  test("GET /ws/tasks/abc/comments is flagged listEndpoint", () => {
    const m = matchRoute("GET", "/ws/tasks/abc/comments", new URLSearchParams());
    expect(m?.entry.flags?.listEndpoint).toBe(true);
  });

  test("GET /ws/time-entries is flagged listEndpoint", () => {
    const m = matchRoute("GET", "/ws/time-entries", new URLSearchParams());
    expect(m?.entry.flags?.listEndpoint).toBe(true);
  });

  test("POST /ws/tasks is flagged authorRewritable", () => {
    const m = matchRoute("POST", "/ws/tasks", new URLSearchParams());
    expect(m?.entry.flags?.authorRewritable).toBe(true);
  });

  test("PATCH /ws/tasks/abc is flagged authorRewritable", () => {
    const m = matchRoute("PATCH", "/ws/tasks/abc", new URLSearchParams());
    expect(m?.entry.flags?.authorRewritable).toBe(true);
  });

  test("POST /ws/tasks/abc/comments is flagged authorRewritable", () => {
    const m = matchRoute("POST", "/ws/tasks/abc/comments", new URLSearchParams());
    expect(m?.entry.flags?.authorRewritable).toBe(true);
  });

  test("DELETE /ws/tasks/abc is NOT flagged authorRewritable", () => {
    const m = matchRoute("DELETE", "/ws/tasks/abc", new URLSearchParams());
    expect(m?.entry.flags?.authorRewritable).toBeFalsy();
  });

  test("table snapshot — surfaces drift when new endpoints land", () => {
    expect(
      ROUTE_TABLE.map((e) => `${e.method} ${e.pattern.source} → ${e.verb}`).sort(),
    ).toMatchSnapshot();
  });
});
