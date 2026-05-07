import { errorResponse } from "./errors";

const TIMEOUT_MS = 15_000;

function getBase(): string {
  const base = process.env.WEEEK_API_BASE;
  if (!base) throw new Error("WEEEK_API_BASE is required");
  return base.replace(/\/+$/, "");
}

const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "content-length",
]);

function buildUpstreamHeaders(incoming: Headers, masterKey: string): Headers {
  const out = new Headers();
  for (const [key, value] of incoming) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    if (key.toLowerCase() === "authorization") continue;
    out.set(key, value);
  }
  out.set("authorization", `Bearer ${masterKey}`);
  return out;
}

export type ForwardInput = {
  masterKey: string;
  pathname: string;
  search: string;
  method: string;
  headers: Headers;
  body: BodyInit | null;
  requestId?: string;
  subKeyId?: string;
};

export async function forward(input: ForwardInput): Promise<Response> {
  const url = `${getBase()}${input.pathname}${input.search}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: input.method,
      headers: buildUpstreamHeaders(input.headers, input.masterKey),
      body: input.body,
      signal: controller.signal,
      ...(input.body != null ? { duplex: "half" } : {}),
    } as RequestInit);
  } catch (err) {
    return errorResponse({
      code: "upstream_error",
      status: 502,
      message: `Upstream Weeek call failed: ${(err as Error).message}`,
      subKeyId: input.subKeyId,
      requestId: input.requestId ?? "unknown",
    });
  } finally {
    clearTimeout(timer);
  }

  // Strip hop-by-hop headers on the way back out as well.
  const headers = new Headers();
  for (const [k, v] of upstream.headers) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    headers.set(k, v);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
