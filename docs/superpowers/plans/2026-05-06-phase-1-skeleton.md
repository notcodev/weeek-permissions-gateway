# Phase 1 — Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a deployable Next.js application with email+password auth, a Drizzle/Postgres schema for Better Auth, a wired tRPC layer, basic shadcn/ui pages, structural logging, health checks, and CI. After this phase a user can sign up, sign in, see a protected dashboard, and sign out; nothing about Weeek workspaces or sub-keys exists yet.

**Architecture:** Single Next.js (App Router) process. Better Auth handles credentials and sessions, persisting to Postgres via Drizzle. tRPC sits behind the session for future admin operations. Postgres runs in Docker for dev. CI runs lint, typecheck, build, and an integration test that exercises the sign-up → sign-in path.

**Tech Stack:** Next.js 15 (App Router, Node runtime), TypeScript (strict), pnpm, Drizzle ORM + PostgreSQL 16, Better Auth (email+password only this phase), tRPC v11 + TanStack Query + superjson, Tailwind v4 + shadcn/ui, Zod, pino, vitest + testcontainers, GitHub Actions.

**Spec reference:** `docs/superpowers/specs/2026-05-06-weeek-permissions-gateway-design.md` — implements §3 (auth surface partial: only email+password), §5 (stack), §6 (auth tables only), §8 (auth surface partial), §9 (tRPC bootstrap, no domain routers yet), §16 (repo layout — auth subset), §17 (env var subset).

**Out of scope for this phase (covered by later phase plans):** Google OAuth, organization plugin, workspace import, master-key crypto, sub-key issuance, proxy, audit log, Caddy/production deployment, rate limits, rotation tooling.

---

## File Structure

Files created in this phase:

```
package.json                              # deps + scripts
pnpm-lock.yaml                            # generated
tsconfig.json                             # strict TS config
next.config.mjs                           # Next.js config (serverActions, output)
postcss.config.mjs                        # Tailwind v4
tailwind.config.ts                        # shadcn theme tokens
components.json                           # shadcn registry config
drizzle.config.ts                         # drizzle-kit config
biome.json                                # lint + format
vitest.config.ts                          # test runner
.env.example                              # env templates
.gitignore                                # node, next, env
.dockerignore                             # for future Dockerfile
docker-compose.dev.yml                    # postgres only (for local dev)
README.md                                 # minimal: how to run

src/app/
├── layout.tsx                            # root html, fonts, providers
├── globals.css                           # tailwind + theme
├── (marketing)/page.tsx                  # landing — links to sign-in
├── (auth)/sign-in/page.tsx               # client form
├── (auth)/sign-up/page.tsx               # client form
├── (app)/
│   ├── layout.tsx                        # session-protected shell
│   └── dashboard/page.tsx                # placeholder "Hello, {email}"
└── api/
    ├── auth/[...all]/route.ts            # Better Auth handler (toNextJsHandler)
    ├── trpc/[trpc]/route.ts              # tRPC fetch adapter
    ├── healthz/route.ts                  # liveness
    └── readyz/route.ts                   # DB ping

src/server/
├── auth.ts                               # Better Auth instance
├── db/
│   ├── client.ts                         # postgres-js + drizzle()
│   ├── schema/
│   │   ├── index.ts                      # re-exports
│   │   └── auth.ts                       # user/account/session/verification tables
│   └── migrations/                       # drizzle-kit output (generated)
├── trpc/
│   ├── init.ts                           # createTRPCContext, t = initTRPC, transformer
│   ├── procedures.ts                     # publicProcedure, protectedProcedure
│   └── routers/
│       ├── index.ts                      # appRouter
│       └── me.ts                         # me.whoami() — used by integration test
└── logger.ts                             # pino instance

src/lib/
├── auth-client.ts                        # createAuthClient() for the browser
├── trpc-client.ts                        # createTRPCReact + react-query provider
└── utils.ts                              # cn() + small helpers

src/components/
├── providers.tsx                         # QueryClient + tRPC + Better Auth provider
└── ui/                                   # shadcn-generated: button, input, label, card, form, sonner

tests/
├── setup.ts                              # vitest global setup
└── integration/
    └── auth.test.ts                      # sign-up + sign-in roundtrip via fetch

scripts/
└── (none in this phase)

.github/workflows/ci.yml                  # lint + typecheck + build + integration tests
```

---

### Task 1 — Project bootstrap (Next.js + TS + tooling)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `.gitignore`
- Create: `.dockerignore`
- Create: `biome.json`
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/(marketing)/page.tsx`

- [ ] **Step 1: Initialise pnpm workspace**

Run from repo root:

```bash
pnpm init
```

Then **replace** the generated `package.json` with the version below.

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "weeek-api-permissions",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.59.0",
    "@trpc/client": "11.0.0-rc.502",
    "@trpc/react-query": "11.0.0-rc.502",
    "@trpc/server": "11.0.0-rc.502",
    "better-auth": "^1.0.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "drizzle-orm": "^0.36.0",
    "lucide-react": "^0.460.0",
    "next": "15.1.6",
    "pino": "^9.5.0",
    "pino-pretty": "^11.3.0",
    "postgres": "^3.4.5",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "sonner": "^1.7.0",
    "superjson": "^2.2.1",
    "tailwind-merge": "^2.5.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@tailwindcss/postcss": "^4.0.0",
    "@types/node": "^22.10.0",
    "@types/react": "19.0.0",
    "@types/react-dom": "19.0.0",
    "drizzle-kit": "^0.28.0",
    "tailwindcss": "^4.0.0",
    "testcontainers": "^10.13.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  },
  "packageManager": "pnpm@9.12.0"
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules
.pnpm-store
.next
out
dist
coverage

.env
.env.local
.env.*.local

*.log
.DS_Store
```

- [ ] **Step 6: Write `.dockerignore`**

```
node_modules
.next
.git
.env
.env.local
coverage
tests
docs
.github
```

- [ ] **Step 7: Write `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignoreUnknown": true, "ignore": [".next", "src/server/db/migrations"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": { "useImportType": "error" },
      "suspicious": { "noExplicitAny": "error" }
    }
  },
  "javascript": { "formatter": { "quoteStyle": "double", "semicolons": "always" } }
}
```

- [ ] **Step 8: Write `src/app/globals.css`** (plain CSS only — Tailwind directives land in Task 2)

```css
html, body { height: 100%; margin: 0; font-family: system-ui, sans-serif; }
a { color: inherit; }
```

- [ ] **Step 9: Write `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Weeek Permissions Gateway",
  description: "Issue scoped Weeek API keys",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 10: Write `src/app/(marketing)/page.tsx`**

```tsx
import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <h1 className="text-4xl font-semibold">Weeek Permissions Gateway</h1>
      <p className="text-lg opacity-80">
        Issue scoped Weeek API keys with explicit permissions and audit.
      </p>
      <div className="flex gap-3">
        <Link href="/sign-in" className="underline">Sign in</Link>
        <Link href="/sign-up" className="underline">Sign up</Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 11: Install deps and verify build**

```bash
pnpm install
pnpm build
```

Expected: build succeeds, `.next` directory created, no type errors.

- [ ] **Step 12: Commit**

```bash
git add .
git commit -m "phase-1 task 1: project bootstrap (next.js + ts + biome + tailwind)"
```

---

### Task 2 — Tailwind v4 + shadcn/ui setup

**Files:**
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/label.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/form.tsx`
- Create: `src/components/ui/sonner.tsx`

- [ ] **Step 1: Write `postcss.config.mjs`**

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 2: Write `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
};

export default config;
```

- [ ] **Step 2a: Add the Tailwind import to `src/app/globals.css`**

Replace the file with:

```css
@import "tailwindcss";

html, body { height: 100%; margin: 0; }
a { color: inherit; }
```

- [ ] **Step 3: Write `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 4: Write `src/lib/utils.ts`**

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Generate shadcn primitives**

Run:

```bash
pnpm dlx shadcn@latest add button input label card form sonner --yes
```

Expected: each component appears under `src/components/ui/`. Open `src/components/ui/button.tsx` and confirm it exports `Button`. If `shadcn` asks interactive questions, accept the defaults (Server Components, neutral palette). If a component name is missing in your registry version, install it directly:

```bash
pnpm dlx shadcn@latest add <missing-name> --yes
```

- [ ] **Step 6: Verify components import cleanly**

Run:

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "phase-1 task 2: tailwind v4 + shadcn/ui primitives"
```

---

### Task 3 — Postgres dev container + Drizzle config

**Files:**
- Create: `docker-compose.dev.yml`
- Create: `.env.example`
- Create: `drizzle.config.ts`
- Create: `src/server/db/client.ts`
- Create: `src/server/db/schema/index.ts`

- [ ] **Step 1: Write `docker-compose.dev.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: wgw_pg_dev
    environment:
      POSTGRES_DB: weeek_perm
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d weeek_perm"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata: {}
```

- [ ] **Step 2: Write `.env.example`**

```
DATABASE_URL=postgres://app:app@localhost:5432/weeek_perm
BETTER_AUTH_SECRET=replace-with-32-bytes-base64
BETTER_AUTH_URL=http://localhost:3000
LOG_LEVEL=info
NODE_ENV=development
```

- [ ] **Step 3: Create local `.env` (not committed)**

```bash
cp .env.example .env
# Generate a real secret:
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
# Paste the output as BETTER_AUTH_SECRET in .env
```

- [ ] **Step 4: Start Postgres**

```bash
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml ps
```

Expected: `wgw_pg_dev` is `healthy`.

- [ ] **Step 5: Write `drizzle.config.ts`**

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/schema/index.ts",
  out: "./src/server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
```

Note: `dotenv/config` is fine here because `drizzle.config.ts` only runs in CLI/dev. Add `dotenv` as a dev dep:

```bash
pnpm add -D dotenv
```

- [ ] **Step 6: Write `src/server/db/client.ts`**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const client = postgres(url, { max: 10 });
export const db = drizzle(client, { schema });
export type DB = typeof db;
```

- [ ] **Step 7: Write `src/server/db/schema/index.ts`**

```ts
export * from "./auth";
```

(Will fail to compile until Task 4 adds `auth.ts`. We commit together with Task 4.)

- [ ] **Step 8: Commit (without typecheck — auth schema lands next)**

```bash
git add docker-compose.dev.yml .env.example drizzle.config.ts src/server/db/client.ts src/server/db/schema/index.ts package.json pnpm-lock.yaml
git commit -m "phase-1 task 3: postgres dev container + drizzle scaffolding"
```

---

### Task 4 — Better Auth tables + first migration

**Files:**
- Create: `src/server/db/schema/auth.ts`
- Create (generated): `src/server/db/migrations/0000_*.sql`

- [ ] **Step 1: Write `src/server/db/schema/auth.ts`**

```ts
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

These names and columns match what Better Auth expects when you point it at a Drizzle adapter; if a future Better Auth release renames anything we adjust here.

- [ ] **Step 2: Generate the migration**

```bash
pnpm db:generate
```

Expected: a file appears under `src/server/db/migrations/0000_*.sql` containing four `CREATE TABLE` statements. Commit it as-is.

- [ ] **Step 3: Apply the migration**

```bash
pnpm db:migrate
```

Expected: migration applied; `psql` shows the four tables:

```bash
docker exec -it wgw_pg_dev psql -U app -d weeek_perm -c "\dt"
```

Expected output lists `user`, `session`, `account`, `verification`.

- [ ] **Step 4: Verify typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema/auth.ts src/server/db/migrations
git commit -m "phase-1 task 4: better auth tables + initial drizzle migration"
```

---

### Task 5 — Better Auth instance + handler route

**Files:**
- Create: `src/server/auth.ts`
- Create: `src/app/api/auth/[...all]/route.ts`
- Create: `src/lib/auth-client.ts`

- [ ] **Step 1: Write `src/server/auth.ts`**

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/client";
import * as schema from "./db/schema/auth";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) throw new Error("BETTER_AUTH_SECRET is required");

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // verification flow lands later
    minPasswordLength: 12,
  },
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // refresh once a day
  },
});

export type Auth = typeof auth;
```

- [ ] **Step 2: Write `src/app/api/auth/[...all]/route.ts`**

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

export const { GET, POST } = toNextJsHandler(auth.handler);
```

- [ ] **Step 3: Write `src/lib/auth-client.ts`**

```ts
"use client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL:
    typeof window === "undefined"
      ? (process.env.BETTER_AUTH_URL ?? "http://localhost:3000")
      : window.location.origin,
});

export const { signIn, signUp, signOut, useSession } = authClient;
```

- [ ] **Step 4: Boot the dev server and probe the handler**

```bash
pnpm dev
```

In another shell:

```bash
curl -i http://localhost:3000/api/auth/ok
```

Expected: HTTP 200 (Better Auth health probe). Stop `pnpm dev` afterwards.

- [ ] **Step 5: Commit**

```bash
git add src/server/auth.ts src/app/api/auth src/lib/auth-client.ts
git commit -m "phase-1 task 5: wire better auth (email+password) handler"
```

---

### Task 6 — Sign-up page (UI + client form)

**Files:**
- Create: `src/components/providers.tsx`
- Modify: `src/app/layout.tsx`
- Create: `src/app/(auth)/sign-up/page.tsx`

- [ ] **Step 1: Write `src/components/providers.tsx`**

```tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Modify `src/app/layout.tsx` to mount `<Providers>`**

Replace the existing file with:

```tsx
import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Weeek Permissions Gateway",
  description: "Issue scoped Weeek API keys",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Write `src/app/(auth)/sign-up/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "@/lib/auth-client";

export default function SignUpPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const name = String(form.get("name") || email.split("@")[0]);
    setPending(true);
    const { error } = await signUp.email({ email, password, name });
    setPending(false);
    if (error) {
      toast.error(error.message ?? "Sign-up failed");
      return;
    }
    toast.success("Account created");
    router.push("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" autoComplete="name" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Smoke test in the browser**

```bash
pnpm dev
```

Open `http://localhost:3000/sign-up`, sign up with an email + 12-char password. Expected: toast "Account created", redirect to `/dashboard` (will 404 until Task 8 — that is fine for now). Stop `pnpm dev`.

- [ ] **Step 5: Commit**

```bash
git add src/components/providers.tsx src/app/layout.tsx src/app/\(auth\)/sign-up
git commit -m "phase-1 task 6: sign-up page + react-query provider"
```

---

### Task 7 — Sign-in page

**Files:**
- Create: `src/app/(auth)/sign-in/page.tsx`

- [ ] **Step 1: Write `src/app/(auth)/sign-in/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setPending(true);
    const { error } = await signIn.email({ email, password });
    setPending(false);
    if (error) {
      toast.error(error.message ?? "Sign-in failed");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-sm opacity-70">
              No account? <Link href="/sign-up" className="underline">Create one</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Smoke test**

```bash
pnpm dev
```

Open `http://localhost:3000/sign-in`, sign in with the user from Task 6. Expected: redirect to `/dashboard` (still 404 until Task 8).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/sign-in
git commit -m "phase-1 task 7: sign-in page"
```

---

### Task 8 — Protected app shell + dashboard placeholder

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/dashboard/page.tsx`
- Create: `src/components/feature/sign-out-button.tsx`

- [ ] **Step 1: Write `src/components/feature/sign-out-button.tsx`** (client component)

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className="text-sm underline disabled:opacity-50"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await signOut();
        router.push("/sign-in");
        router.refresh();
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
```

- [ ] **Step 2: Write `src/app/(app)/layout.tsx`**

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/server/auth";
import { SignOutButton } from "@/components/feature/sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link href="/dashboard" className="font-semibold">
          Weeek Permissions Gateway
        </Link>
        <SignOutButton />
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Write `src/app/(app)/dashboard/page.tsx`**

```tsx
import { headers } from "next/headers";
import { auth } from "@/server/auth";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="opacity-80">
        Hello, {session?.user.email}. Workspace management lands in the next phase.
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Smoke test**

```bash
pnpm dev
```

Sign in, land on `/dashboard`, see your email. Click "Sign out" → redirected to `/sign-in`. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\) src/components/feature
git commit -m "phase-1 task 8: protected app shell + sign-out + dashboard placeholder"
```

---

### Task 9 — Structured logger (pino)

**Files:**
- Create: `src/server/logger.ts`

- [ ] **Step 1: Write `src/server/logger.ts`**

```ts
import pino from "pino";

const level = process.env.LOG_LEVEL ?? "info";

export const logger = pino({
  level,
  base: { app: "weeek-permissions-gateway" },
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "password"],
    remove: true,
  },
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
});

export type Logger = typeof logger;
```

- [ ] **Step 2: Commit**

```bash
git add src/server/logger.ts
git commit -m "phase-1 task 9: pino logger with auth/cookie redaction"
```

---

### Task 10 — tRPC bootstrap + `me.whoami`

**Files:**
- Create: `src/server/trpc/init.ts`
- Create: `src/server/trpc/procedures.ts`
- Create: `src/server/trpc/routers/me.ts`
- Create: `src/server/trpc/routers/index.ts`
- Create: `src/app/api/trpc/[trpc]/route.ts`
- Create: `src/lib/trpc-client.ts`
- Modify: `src/components/providers.tsx`

- [ ] **Step 1: Write `src/server/trpc/init.ts`**

```ts
import { initTRPC, TRPCError } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { auth } from "@/server/auth";

export async function createTRPCContext(opts: FetchCreateContextFnOptions) {
  const session = await auth.api.getSession({ headers: opts.req.headers });
  return { session, headers: opts.req.headers };
}
export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({ transformer: superjson });

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

const requireAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

export const protectedProcedure = t.procedure.use(requireAuth);
```

- [ ] **Step 2: Write `src/server/trpc/procedures.ts`**

```ts
export { publicProcedure, protectedProcedure } from "./init";
```

- [ ] **Step 3: Write `src/server/trpc/routers/me.ts`**

```ts
import { protectedProcedure, router } from "../init";

export const meRouter = router({
  whoami: protectedProcedure.query(({ ctx }) => ({
    id: ctx.session.user.id,
    email: ctx.session.user.email,
    name: ctx.session.user.name,
  })),
});
```

- [ ] **Step 4: Write `src/server/trpc/routers/index.ts`**

```ts
import { router } from "../init";
import { meRouter } from "./me";

export const appRouter = router({ me: meRouter });
export type AppRouter = typeof appRouter;
```

- [ ] **Step 5: Write `src/app/api/trpc/[trpc]/route.ts`**

```ts
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createTRPCContext } from "@/server/trpc/init";
import { appRouter } from "@/server/trpc/routers";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: (opts) => createTRPCContext(opts),
  });

export { handler as GET, handler as POST };
```

- [ ] **Step 6: Write `src/lib/trpc-client.ts`**

```ts
"use client";
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/trpc/routers";

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClientConfig() {
  return {
    links: [
      httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: (url, opts) => fetch(url, { ...opts, credentials: "include" }),
      }),
    ],
  };
}
```

- [ ] **Step 7: Update `src/components/providers.tsx` to mount the tRPC provider**

Replace the file with:

```tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { trpc, createTRPCClientConfig } from "@/lib/trpc-client";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => trpc.createClient(createTRPCClientConfig()));
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

- [ ] **Step 8: Verify typecheck and dev boot**

```bash
pnpm typecheck
pnpm dev
```

While `pnpm dev` is running, sign in and visit
`http://localhost:3000/api/trpc/me.whoami?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D`.
Expected: a JSON body containing your email under `result.data.json.email`.
Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add src/server/trpc src/app/api/trpc src/lib/trpc-client.ts src/components/providers.tsx
git commit -m "phase-1 task 10: trpc bootstrap + me.whoami"
```

---

### Task 11 — Health checks (`/healthz`, `/readyz`)

**Files:**
- Create: `src/app/api/healthz/route.ts`
- Create: `src/app/api/readyz/route.ts`

- [ ] **Step 1: Write `src/app/api/healthz/route.ts`**

```ts
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
```

- [ ] **Step 2: Write `src/app/api/readyz/route.ts`**

```ts
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ready" });
  } catch (err) {
    logger.error({ err }, "readyz: db ping failed");
    return Response.json({ status: "not_ready" }, { status: 503 });
  }
}
```

- [ ] **Step 3: Smoke test**

```bash
pnpm dev
curl -s http://localhost:3000/api/healthz
curl -s http://localhost:3000/api/readyz
```

Expected:
- `healthz` → `{"status":"ok"}` 200
- `readyz` → `{"status":"ready"}` 200

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/healthz src/app/api/readyz
git commit -m "phase-1 task 11: liveness + readiness endpoints"
```

---

### Task 12 — Vitest config + integration test for sign-up/sign-in

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/integration/auth.test.ts`

We test the actual HTTP surface of Better Auth against a Postgres started by
testcontainers, so the test is not coupled to internals and survives Better
Auth version bumps.

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    sequence: { concurrent: false },
  },
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "./src") },
  },
});
```

- [ ] **Step 2: Write `tests/setup.ts`**

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { afterAll, beforeAll } from "vitest";
import { execSync } from "node:child_process";

let pg: StartedPostgreSqlContainer | undefined;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("weeek_perm_test")
    .withUsername("test")
    .withPassword("test")
    .start();

  process.env.DATABASE_URL = pg.getConnectionUri();
  process.env.BETTER_AUTH_SECRET ||= "test-secret-only-for-unit-tests-32by";
  process.env.BETTER_AUTH_URL ||= "http://localhost:3000";

  // Apply migrations against the test DB.
  execSync("pnpm db:migrate", { stdio: "inherit", env: process.env });
});

afterAll(async () => {
  await pg?.stop();
});
```

- [ ] **Step 3: Write `tests/integration/auth.test.ts`**

This test imports the Better Auth instance directly and exercises the same API the route handler uses. We avoid spinning up Next.js — that surface lands in a later e2e phase.

```ts
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
```

> If a future Better Auth version exposes a different method shape for
> `signUpEmail`/`signInEmail`, adjust the calls — the assertions are stable.

- [ ] **Step 4: Run the test**

```bash
pnpm test
```

Expected: both cases pass. testcontainers will pull `postgres:16-alpine` once;
subsequent runs are fast.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts tests
git commit -m "phase-1 task 12: vitest + better-auth integration test (testcontainers)"
```

---

### Task 13 — README + final dev hygiene

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# Weeek Permissions Gateway

A multi-tenant gateway that issues scoped Weeek API keys with explicit
permissions and audit. See `docs/superpowers/specs/2026-05-06-weeek-permissions-gateway-design.md`
for the full design.

## Phase 1 status

- Email + password auth (Better Auth)
- Postgres + Drizzle migrations
- tRPC bootstrap (`me.whoami`)
- Liveness/readiness endpoints
- Integration tests against a real Postgres via testcontainers

## Local dev

```bash
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))" \
  # paste into BETTER_AUTH_SECRET in .env

docker compose -f docker-compose.dev.yml up -d
pnpm install
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000.

## Scripts

| Command           | Purpose                                |
|-------------------|----------------------------------------|
| `pnpm dev`        | Run Next.js in dev                     |
| `pnpm build`      | Production build                       |
| `pnpm test`       | Run integration tests (testcontainers) |
| `pnpm typecheck`  | TypeScript --noEmit                    |
| `pnpm lint`       | Biome check                            |
| `pnpm db:generate`| Generate drizzle migrations            |
| `pnpm db:migrate` | Apply migrations to `$DATABASE_URL`    |
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "phase-1 task 13: readme for dev setup"
```

---

### Task 14 — GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  static:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm build

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      # testcontainers needs Docker; ubuntu-latest already has it.
      - run: pnpm test
```

- [ ] **Step 2: Verify locally before pushing**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .github
git commit -m "phase-1 task 14: github actions ci (lint, typecheck, build, tests)"
```

---

## Definition of Done — Phase 1

- A new user can sign up at `/sign-up`, sign in at `/sign-in`, see
  `/dashboard` with their email, and sign out — all backed by Better Auth +
  Postgres.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` all pass locally and
  on CI for `main` and PRs.
- `/api/healthz` and `/api/readyz` return correct status, with `readyz`
  failing if the DB is unreachable.
- `me.whoami` tRPC query returns the current session's user when called from a
  signed-in client.
- All schema changes are committed as Drizzle migrations under
  `src/server/db/migrations`.

Anything not in this list (Google OAuth, organisations, workspace import,
sub-keys, proxy, audit, master-key crypto, production deployment) is intentionally
deferred to later phase plans.
