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

  test("POST /ws/projects → null (write verbs deferred to phase 5)", () => {
    const m = matchRoute("POST", "/ws/projects", new URLSearchParams());
    expect(m).toBeNull();
  });

  test("GET /ws/unknown → null", () => {
    const m = matchRoute("GET", "/ws/this-is-not-real", new URLSearchParams());
    expect(m).toBeNull();
  });

  test("GET /not-ws/projects → null (out-of-prefix)", () => {
    const m = matchRoute("GET", "/not-ws/projects", new URLSearchParams());
    expect(m).toBeNull();
  });

  test("table snapshot — surfaces drift when new endpoints land", () => {
    expect(
      ROUTE_TABLE.map((e) => `${e.method} ${e.pattern.source} → ${e.verb}`).sort(),
    ).toMatchSnapshot();
  });
});
