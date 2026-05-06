import { WeeekValidationError } from "./errors";

const VALIDATE_PATH = "/ws/members?limit=1";
const TIMEOUT_MS = 10_000;

function getBase(): string {
  const base = process.env.WEEEK_API_BASE;
  if (!base) throw new Error("WEEEK_API_BASE is required");
  return base.replace(/\/+$/, "");
}

export type ValidateOk = { ok: true };

export async function validateMasterKey(rawKey: string): Promise<ValidateOk> {
  const url = `${getBase()}${VALIDATE_PATH}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${rawKey}` },
      signal: controller.signal,
    });
  } catch (err) {
    throw new WeeekValidationError(
      "network",
      `Network error contacting Weeek: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 200) return { ok: true };
  if (res.status === 401 || res.status === 403) {
    throw new WeeekValidationError("unauthorized", "Weeek rejected the master key", res.status);
  }
  if (res.status >= 500) {
    throw new WeeekValidationError(
      "upstream_5xx",
      `Weeek returned ${res.status}; try again`,
      res.status,
    );
  }
  throw new WeeekValidationError(
    "unexpected_status",
    `Weeek returned unexpected status ${res.status}`,
    res.status,
  );
}
