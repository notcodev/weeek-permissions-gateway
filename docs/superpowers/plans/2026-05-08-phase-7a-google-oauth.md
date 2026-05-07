# Phase 7a — Google OAuth

**Goal:** Wire Better Auth's `socialProviders.google` so users can sign in / sign up with Google. Opt-in by env vars; deployments without `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` keep showing only the email/password flow with no broken UI.

## Env additions

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Both blank by default. Better Auth's `socialProviders` is only attached when both are present.

## Server config

`src/server/auth.ts` reads both env vars; if both are set, attaches `socialProviders: { google: { clientId, clientSecret } }`. Otherwise the spread is `undefined` and the `betterAuth({...})` call sees no social providers — no broken endpoints.

A new export `isGoogleEnabled: boolean` tells server pages whether to render the Google button. This avoids leaking the env presence to the client.

## UI

- New `src/components/feature/google-sign-in-button.tsx` — `<Button>` with inline-SVG Google glyph. Calls `signIn.social({ provider: "google", callbackURL })`. Doesn't reset its own pending state on success because Better Auth navigates away during the OAuth round-trip.
- Sign-in and sign-up pages split into a server-rendered shell (`page.tsx`) and a client form (`sign-in-form.tsx` / `sign-up-form.tsx`). The shell reads `isGoogleEnabled` and forwards as a prop. The client form conditionally renders the Google button + a divider above the email/password form.
- Labels: "Continue with Google" on sign-in, "Sign up with Google" on sign-up.

## What's deferred

- 7b: Better Auth `organization()` plugin + `org.*` tRPC wrappers + accept-invite page.
- 7c: Owner-context switcher in app shell + plumbing through every workspace-bound query.
- Email verification flow on Google sign-up — Google emails are pre-verified by default, no extra step needed; revisit if we add other providers.
- Linking Google to an existing email/password account (Better Auth supports it via `account.linkSocial`; adding when phase 7c surfaces a Profile page).

## Tests

UI components have no unit tests in this repo. Lint + typecheck + the existing 206 tests gate the contract; manual smoke for the OAuth round-trip is the controller's responsibility (no `.env` in worktree).

Suite: 206 tests across 24 files, all green.

## Commits

1. `phase-7a task 0: Google OAuth env + Better Auth socialProviders config`
2. `phase-7a task 1: GoogleSignInButton + split sign-in/up into server shell + client form`
3. `docs: phase 7a plan`
