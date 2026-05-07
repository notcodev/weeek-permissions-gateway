import { describe, expect, test } from "vitest";
import { matchRoute, ROUTE_TABLE } from "@/server/proxy/routeTable";

describe("matchRoute", () => {
  // --- Reads ---
  test("GET /tm/projects → projects:read", () => {
    const m = matchRoute("GET", "/tm/projects", new URLSearchParams());
    expect(m?.entry.verb).toBe("projects:read");
    expect(m?.params).toEqual({});
  });

  test("GET /tm/projects/42 → projects:read with projectId=42", () => {
    const m = matchRoute("GET", "/tm/projects/42", new URLSearchParams());
    expect(m?.entry.verb).toBe("projects:read");
    expect(m?.params.projectId).toBe("42");
  });

  test("GET /tm/boards?projectId=7 → boards:read; projectId pulled from query", () => {
    const m = matchRoute("GET", "/tm/boards", new URLSearchParams("projectId=7"));
    expect(m?.entry.verb).toBe("boards:read");
    expect(m?.params.projectId).toBe("7");
  });

  test("GET /tm/tasks → tasks:read; flagged listEndpoint", () => {
    const m = matchRoute("GET", "/tm/tasks", new URLSearchParams("projectId=9&boardId=4"));
    expect(m?.entry.verb).toBe("tasks:read");
    expect(m?.params).toEqual({ projectId: "9", boardId: "4" });
    expect(m?.entry.flags?.listEndpoint).toBe(true);
  });

  test("GET /tm/tasks/abc → tasks:read; NOT listEndpoint", () => {
    const m = matchRoute("GET", "/tm/tasks/abc", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:read");
    expect(m?.entry.flags?.listEndpoint).toBeFalsy();
  });

  test("GET /ws/members → members:read", () => {
    const m = matchRoute("GET", "/ws/members", new URLSearchParams());
    expect(m?.entry.verb).toBe("members:read");
  });

  test("GET /tm/custom-fields → custom_fields:read", () => {
    const m = matchRoute("GET", "/tm/custom-fields", new URLSearchParams());
    expect(m?.entry.verb).toBe("custom_fields:read");
  });

  // --- Writes (PUT for updates per Weeek API) ---
  test("POST /tm/projects → projects:write", () => {
    const m = matchRoute("POST", "/tm/projects", new URLSearchParams());
    expect(m?.entry.verb).toBe("projects:write");
  });

  test("PUT /tm/projects/42 → projects:write with projectId", () => {
    const m = matchRoute("PUT", "/tm/projects/42", new URLSearchParams());
    expect(m?.entry.verb).toBe("projects:write");
    expect(m?.params.projectId).toBe("42");
  });

  test("DELETE /tm/projects/42 → projects:delete", () => {
    const m = matchRoute("DELETE", "/tm/projects/42", new URLSearchParams());
    expect(m?.entry.verb).toBe("projects:delete");
  });

  test("POST /tm/projects/42/archive → projects:write", () => {
    const m = matchRoute("POST", "/tm/projects/42/archive", new URLSearchParams());
    expect(m?.entry.verb).toBe("projects:write");
  });

  test("POST /tm/projects/42/un-archive → projects:write", () => {
    const m = matchRoute("POST", "/tm/projects/42/un-archive", new URLSearchParams());
    expect(m?.entry.verb).toBe("projects:write");
  });

  test("POST /tm/boards → boards:write", () => {
    const m = matchRoute("POST", "/tm/boards", new URLSearchParams());
    expect(m?.entry.verb).toBe("boards:write");
  });

  test("PUT /tm/boards/9 → boards:write with boardId", () => {
    const m = matchRoute("PUT", "/tm/boards/9", new URLSearchParams());
    expect(m?.entry.verb).toBe("boards:write");
    expect(m?.params.boardId).toBe("9");
  });

  test("DELETE /tm/boards/9 → boards:delete", () => {
    const m = matchRoute("DELETE", "/tm/boards/9", new URLSearchParams());
    expect(m?.entry.verb).toBe("boards:delete");
  });

  test("POST /tm/tasks → tasks:write; flagged authorRewritable", () => {
    const m = matchRoute("POST", "/tm/tasks", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:write");
    expect(m?.entry.flags?.authorRewritable).toBe(true);
  });

  test("PUT /tm/tasks/abc → tasks:write; flagged authorRewritable", () => {
    const m = matchRoute("PUT", "/tm/tasks/abc", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:write");
    expect(m?.entry.flags?.authorRewritable).toBe(true);
  });

  test("DELETE /tm/tasks/abc → tasks:delete", () => {
    const m = matchRoute("DELETE", "/tm/tasks/abc", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:delete");
  });

  test("POST /tm/tasks/abc/complete → tasks:complete", () => {
    const m = matchRoute("POST", "/tm/tasks/abc/complete", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:complete");
  });

  test("POST /tm/tasks/abc/un-complete → tasks:complete", () => {
    const m = matchRoute("POST", "/tm/tasks/abc/un-complete", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:complete");
  });

  test("POST /tm/tasks/abc/board → tasks:move", () => {
    const m = matchRoute("POST", "/tm/tasks/abc/board", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:move");
  });

  test("POST /tm/tasks/abc/board-column → tasks:move", () => {
    const m = matchRoute("POST", "/tm/tasks/abc/board-column", new URLSearchParams());
    expect(m?.entry.verb).toBe("tasks:move");
  });

  test("POST /tm/custom-fields → custom_fields:write", () => {
    const m = matchRoute("POST", "/tm/custom-fields", new URLSearchParams());
    expect(m?.entry.verb).toBe("custom_fields:write");
  });

  test("PUT /tm/custom-fields/cf1 → custom_fields:write", () => {
    const m = matchRoute("PUT", "/tm/custom-fields/cf1", new URLSearchParams());
    expect(m?.entry.verb).toBe("custom_fields:write");
  });

  test("POST /tm/tasks/t1/time-entries → time_entries:write", () => {
    const m = matchRoute("POST", "/tm/tasks/t1/time-entries", new URLSearchParams());
    expect(m?.entry.verb).toBe("time_entries:write");
  });

  test("PUT /tm/tasks/t1/time-entries/te1 → time_entries:write", () => {
    const m = matchRoute("PUT", "/tm/tasks/t1/time-entries/te1", new URLSearchParams());
    expect(m?.entry.verb).toBe("time_entries:write");
  });

  test("DELETE /tm/tasks/t1/time-entries/te1 → time_entries:delete", () => {
    const m = matchRoute("DELETE", "/tm/tasks/t1/time-entries/te1", new URLSearchParams());
    expect(m?.entry.verb).toBe("time_entries:delete");
  });

  // --- Negative cases ---
  test("PATCH /tm/tasks/abc → null (Weeek uses PUT, not PATCH)", () => {
    const m = matchRoute("PATCH", "/tm/tasks/abc", new URLSearchParams());
    expect(m).toBeNull();
  });

  test("GET /ws/projects → null (projects live under /tm/, not /ws/)", () => {
    const m = matchRoute("GET", "/ws/projects", new URLSearchParams());
    expect(m).toBeNull();
  });

  test("GET /tm/tasks/abc/comments → null (comments not exposed in public API)", () => {
    const m = matchRoute("GET", "/tm/tasks/abc/comments", new URLSearchParams());
    expect(m).toBeNull();
  });

  test("POST /tm/tasks/abc/move → null (no /move endpoint; use /board or /board-column)", () => {
    const m = matchRoute("POST", "/tm/tasks/abc/move", new URLSearchParams());
    expect(m).toBeNull();
  });

  test("GET /ws/time-entries → null (time-entries are nested under tasks)", () => {
    const m = matchRoute("GET", "/ws/time-entries", new URLSearchParams());
    expect(m).toBeNull();
  });

  test("DELETE /tm/custom-fields/cf1 → custom_fields:write (no separate :delete verb for custom_fields)", () => {
    const m = matchRoute("DELETE", "/tm/custom-fields/cf1", new URLSearchParams());
    expect(m?.entry.verb).toBe("custom_fields:write");
  });

  test("GET /not-a-prefix/projects → null", () => {
    const m = matchRoute("GET", "/not-a-prefix/projects", new URLSearchParams());
    expect(m).toBeNull();
  });

  // --- Snapshot ---
  test("table snapshot — surfaces drift when new endpoints land", () => {
    expect(
      ROUTE_TABLE.map((e) => `${e.method} ${e.pattern.source} → ${e.verb}`).sort(),
    ).toMatchSnapshot();
  });
});
