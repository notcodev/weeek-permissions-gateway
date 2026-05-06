import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll } from "vitest";

let pg: StartedPostgreSqlContainer | undefined;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("weeek_perm_test")
    .withUsername("test")
    .withPassword("test")
    .start();

  process.env.DATABASE_URL = pg.getConnectionUri();
  process.env.BETTER_AUTH_SECRET ||= "test-secret-only-for-unit-tests-32by";
  process.env.FINGERPRINT_HMAC_PEPPER ||= randomBytes(32).toString("base64");
  process.env.BETTER_AUTH_URL ||= "http://localhost:3000";

  execSync("pnpm db:migrate", { stdio: "inherit", env: process.env });
});

afterAll(async () => {
  await pg?.stop();
});
