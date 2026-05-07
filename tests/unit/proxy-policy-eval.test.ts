import { describe, expect, test } from "vitest";
import { evaluate } from "@/server/proxy/policyEval";
import type { AuthedRequest, RouteMatch } from "@/server/proxy/types";

const baseSub = (overrides: Partial<AuthedRequest> = {}): AuthedRequest => ({
  subKeyId: "sk_full",
  subKeyShortId: "sk_full",
  workspaceId: "ws_1",
  verbs: ["tasks:read", "projects:read"],
  scopeProjects: ["*"],
  scopeBoards: ["*"],
  masterKey: "wk_secret",
  ...overrides,
});

const match = (verb: string, params: Record<string, string> = {}): RouteMatch =>
  ({
    entry: {
      method: "GET",
      pattern: /^/,
      resource: verb.split(":")[0] as never,
      verb: verb as never,
      extractParams: () => ({}),
    },
    params,
  }) as RouteMatch;

describe("evaluate", () => {
  test("allows when verb is in sub-key and scope is wildcard", () => {
    expect(evaluate(match("tasks:read", { projectId: "1" }), baseSub())).toEqual({
      allowed: true,
    });
  });

  test("denies verb_missing when verb not in sub-key", () => {
    const out = evaluate(match("comments:read"), baseSub({ verbs: ["tasks:read"] }));
    expect(out).toEqual({
      allowed: false,
      code: "verb_missing",
      message: expect.stringContaining("comments:read"),
    });
  });

  test("denies project_not_in_scope when projectId outside scope_projects", () => {
    const out = evaluate(
      match("tasks:read", { projectId: "9" }),
      baseSub({ scopeProjects: ["1", "2"] }),
    );
    expect(out).toEqual({
      allowed: false,
      code: "project_not_in_scope",
      message: expect.stringContaining("9"),
    });
  });

  test("denies board_not_in_scope when boardId outside scope_boards", () => {
    const out = evaluate(
      match("tasks:read", { boardId: "33" }),
      baseSub({ scopeBoards: ["10"] }),
    );
    expect(out).toEqual({
      allowed: false,
      code: "board_not_in_scope",
      message: expect.stringContaining("33"),
    });
  });

  test("allows when route has no project/board params (e.g. members)", () => {
    expect(evaluate(match("members:read"), baseSub({ verbs: ["members:read"] }))).toEqual({
      allowed: true,
    });
  });

  test("scope ['*'] passes regardless of projectId/boardId", () => {
    const sub = baseSub({ scopeProjects: ["*"], scopeBoards: ["*"] });
    expect(
      evaluate(match("tasks:read", { projectId: "anything", boardId: "anything" }), sub),
    ).toEqual({ allowed: true });
  });
});
