import { describe, expect, test } from "vitest";
import { applyVisibilityFilter, rewriteAuthor } from "@/server/proxy/rewrites";
import type { AuthedRequest, RouteMatch } from "@/server/proxy/types";

const baseSub = (overrides: Partial<AuthedRequest> = {}): AuthedRequest => ({
  subKeyId: "sk_x",
  subKeyShortId: "sk_x",
  workspaceId: "ws",
  verbs: [],
  scopeProjects: ["*"],
  scopeBoards: ["*"],
  boundWeeekUserId: "u-42",
  visibilityBound: false,
  authorRewrite: false,
  masterKey: "wk",
  ...overrides,
});

const matchWith = (
  flags: NonNullable<RouteMatch["entry"]["flags"]> = {},
  method: "GET" | "POST" | "PATCH" = "GET",
): RouteMatch =>
  ({
    entry: {
      method,
      pattern: /^/,
      resource: "tasks",
      verb: method === "GET" ? "tasks:read" : "tasks:write",
      extractParams: () => ({}),
      flags,
    },
    params: {},
  }) as RouteMatch;

describe("applyVisibilityFilter", () => {
  test("injects assigneeId when listEndpoint + visibilityBound + boundWeeekUserId", () => {
    const url = new URL("https://gw.test/ws/tasks?status=open");
    applyVisibilityFilter(url, matchWith({ listEndpoint: true }), baseSub({ visibilityBound: true }));
    expect(url.searchParams.get("assigneeId")).toBe("u-42");
    expect(url.searchParams.get("status")).toBe("open");
  });

  test("no-op when visibilityBound is false", () => {
    const url = new URL("https://gw.test/ws/tasks");
    applyVisibilityFilter(url, matchWith({ listEndpoint: true }), baseSub({ visibilityBound: false }));
    expect(url.searchParams.get("assigneeId")).toBeNull();
  });

  test("no-op when route is not flagged listEndpoint", () => {
    const url = new URL("https://gw.test/ws/tasks/abc");
    applyVisibilityFilter(url, matchWith({}), baseSub({ visibilityBound: true }));
    expect(url.searchParams.get("assigneeId")).toBeNull();
  });

  test("no-op when boundWeeekUserId is null", () => {
    const url = new URL("https://gw.test/ws/tasks");
    applyVisibilityFilter(
      url,
      matchWith({ listEndpoint: true }),
      baseSub({ visibilityBound: true, boundWeeekUserId: null }),
    );
    expect(url.searchParams.get("assigneeId")).toBeNull();
  });

  test("does not overwrite caller-provided assigneeId", () => {
    const url = new URL("https://gw.test/ws/tasks?assigneeId=u-99");
    applyVisibilityFilter(url, matchWith({ listEndpoint: true }), baseSub({ visibilityBound: true }));
    expect(url.searchParams.get("assigneeId")).toBe("u-99");
  });
});

describe("rewriteAuthor", () => {
  test("injects assigneeId when JSON body + authorRewrite + authorRewritable + field absent", async () => {
    const out = await rewriteAuthor(
      JSON.stringify({ title: "x" }),
      "application/json",
      matchWith({ authorRewritable: true }, "POST"),
      baseSub({ authorRewrite: true }),
    );
    expect(out.body).not.toBeNull();
    const parsed = JSON.parse(out.body as string);
    expect(parsed).toEqual({ title: "x", assigneeId: "u-42" });
  });

  test("does NOT overwrite existing assigneeId in the body", async () => {
    const out = await rewriteAuthor(
      JSON.stringify({ title: "x", assigneeId: "u-self-pick" }),
      "application/json",
      matchWith({ authorRewritable: true }, "POST"),
      baseSub({ authorRewrite: true }),
    );
    const parsed = JSON.parse(out.body as string);
    expect(parsed.assigneeId).toBe("u-self-pick");
  });

  test("no-op when authorRewrite is false", async () => {
    const original = JSON.stringify({ title: "x" });
    const out = await rewriteAuthor(
      original,
      "application/json",
      matchWith({ authorRewritable: true }, "POST"),
      baseSub({ authorRewrite: false }),
    );
    expect(out.body).toBe(original);
  });

  test("no-op when route is not authorRewritable", async () => {
    const original = JSON.stringify({ title: "x" });
    const out = await rewriteAuthor(
      original,
      "application/json",
      matchWith({}, "POST"),
      baseSub({ authorRewrite: true }),
    );
    expect(out.body).toBe(original);
  });

  test("no-op for non-JSON content type", async () => {
    const original = "title=x";
    const out = await rewriteAuthor(
      original,
      "application/x-www-form-urlencoded",
      matchWith({ authorRewritable: true }, "POST"),
      baseSub({ authorRewrite: true }),
    );
    expect(out.body).toBe(original);
  });

  test("no-op when boundWeeekUserId is null", async () => {
    const original = JSON.stringify({ title: "x" });
    const out = await rewriteAuthor(
      original,
      "application/json",
      matchWith({ authorRewritable: true }, "POST"),
      baseSub({ authorRewrite: true, boundWeeekUserId: null }),
    );
    expect(out.body).toBe(original);
  });

  test("no-op for null body (e.g., DELETE)", async () => {
    const out = await rewriteAuthor(
      null,
      "application/json",
      matchWith({ authorRewritable: true }, "POST"),
      baseSub({ authorRewrite: true }),
    );
    expect(out.body).toBeNull();
  });

  test("malformed JSON falls through unchanged", async () => {
    const malformed = "not json{";
    const out = await rewriteAuthor(
      malformed,
      "application/json",
      matchWith({ authorRewritable: true }, "POST"),
      baseSub({ authorRewrite: true }),
    );
    expect(out.body).toBe(malformed);
  });
});
