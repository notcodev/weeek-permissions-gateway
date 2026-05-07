import { WeeekValidationError } from "./errors";

const TIMEOUT_MS = 10_000;

function getBase(): string {
  const base = process.env.WEEEK_API_BASE;
  if (!base) throw new Error("WEEEK_API_BASE is required");
  return base.replace(/\/+$/, "");
}

async function callWeeek<T>(path: string, masterKey: string): Promise<T> {
  const url = `${getBase()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${masterKey}` },
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
  if (res.status >= 500) {
    throw new WeeekValidationError("upstream_5xx", `Weeek returned ${res.status}`, res.status);
  }
  if (res.status === 401 || res.status === 403) {
    throw new WeeekValidationError("unauthorized", "Weeek rejected the master key", res.status);
  }
  if (!res.ok) {
    throw new WeeekValidationError(
      "unexpected_status",
      `Weeek returned unexpected status ${res.status}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

export type WeeekProjectRow = { id: number | string; name: string };
export type WeeekBoardRow = { id: number | string; name: string; projectId?: number | string };

function unwrap<T>(env: unknown, keys: readonly string[]): T[] {
  if (Array.isArray(env)) return env as T[];
  if (env && typeof env === "object") {
    const obj = env as Record<string, unknown>;
    for (const k of keys) {
      const v = obj[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

export async function fetchProjects(masterKey: string): Promise<WeeekProjectRow[]> {
  const env = await callWeeek<unknown>("/ws/projects", masterKey);
  return unwrap<WeeekProjectRow>(env, ["projects", "data"]);
}

export async function fetchBoards(
  masterKey: string,
  projectId?: string,
): Promise<WeeekBoardRow[]> {
  const path = projectId
    ? `/ws/boards?projectId=${encodeURIComponent(projectId)}`
    : `/ws/boards`;
  const env = await callWeeek<unknown>(path, masterKey);
  return unwrap<WeeekBoardRow>(env, ["boards", "data"]);
}
