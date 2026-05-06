import { describe, expect, test } from "vitest";

describe("better auth: email + password flow", () => {
  test("sign-up then sign-in returns a session", async () => {
    const { auth } = await import("@/server/auth");

    const email = `user+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    const signUpRes = await auth.api.signUpEmail({
      body: { email, password, name: "Test User" },
    });
    expect(signUpRes.user.email).toBe(email);
    expect(signUpRes.token).toBeTruthy();

    const signInRes = await auth.api.signInEmail({
      body: { email, password },
    });
    expect(signInRes.user.email).toBe(email);
    expect(signInRes.token).toBeTruthy();
  });

  test("wrong password is rejected", async () => {
    const { auth } = await import("@/server/auth");

    const email = `user+${Date.now()}+x@example.com`;
    await auth.api.signUpEmail({
      body: { email, password: "correct horse battery staple", name: "x" },
    });

    await expect(
      auth.api.signInEmail({ body: { email, password: "wrong wrong wrong wrong" } }),
    ).rejects.toThrow();
  });
});
