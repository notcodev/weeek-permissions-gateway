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

// Row shapes mirror the live Weeek public API as exposed at
// https://api.weeek.net/public/v1 (OpenAPI dump at developers.weeek.net).
// Only fields used downstream are required; everything else is reserved as
// optional in case future callers need it.

/** GET /tm/projects → `{ success, projects: Project[] }` */
export type WeeekProjectRow = {
  id: number;
  name: string;
  description?: string | null;
  color?: string;
  status?: 1 | 2;
  isPrivate?: boolean;
  portfolioId?: number | null;
  team?: string[];
  logoLink?: string | null;
};

/** GET /tm/boards → `{ success, boards: Board[] }`. projectId is required per spec. */
export type WeeekBoardRow = {
  id: number;
  name: string;
  projectId: number;
  isPrivate?: boolean;
};

/**
 * GET /ws/members → `{ success, members: User[] }`. Note the public User
 * schema has NO `name` field — display label must be composed from
 * firstName + lastName (or fall back to email).
 */
export type WeeekMemberRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  logo: string | null;
  position: string | null;
  timeZone: string;
};

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
  const env = await callWeeek<unknown>("/tm/projects", masterKey);
  return unwrap<WeeekProjectRow>(env, ["projects", "data"]);
}

export async function fetchMembers(masterKey: string): Promise<WeeekMemberRow[]> {
  const env = await callWeeek<unknown>("/ws/members", masterKey);
  return unwrap<WeeekMemberRow>(env, ["members", "data"]);
}

export async function fetchBoards(
  masterKey: string,
  projectId?: string,
): Promise<WeeekBoardRow[]> {
  // The wire spec types projectId as integer, but URL query strings are
  // always serialized to text — passing the string form here is identical.
  const path = projectId
    ? `/tm/boards?projectId=${encodeURIComponent(projectId)}`
    : `/tm/boards`;
  const env = await callWeeek<unknown>(path, masterKey);
  return unwrap<WeeekBoardRow>(env, ["boards", "data"]);
}
