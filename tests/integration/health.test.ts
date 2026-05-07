import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, test } from "vitest";

beforeAll(() => {
  process.env.MASTER_KEY_ENC_KEY ||= randomBytes(32).toString("base64");
  process.env.FINGERPRINT_HMAC_PEPPER ||= randomBytes(32).toString("base64");
  process.env.SUB_KEY_HMAC_PEPPER ||= randomBytes(32).toString("base64");
});

describe("/healthz", () => {
  test("returns 200 ok when DB reachable", async () => {
    const { GET } = await import("@/app/api/healthz/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });
});

describe("/readyz", () => {
  test("returns 200 ready when DB + crypto pass", async () => {
    const { GET } = await import("@/app/api/readyz/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; checks: Record<string, string> };
    expect(body.status).toBe("ready");
    expect(body.checks.db).toBe("ok");
    expect(body.checks.crypto).toBe("ok");
  });
});
