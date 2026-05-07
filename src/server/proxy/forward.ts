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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function forward(input: ForwardInput): Promise<Response> {
  const url = `${getBase()}${input.pathname}${input.search}`;

  // Streaming bodies cannot be retried — they're consumed on first attempt.
  // Only retry when body is null (all read verbs in phase 4 have null body).
  // Phase 5 (write verbs) will need to buffer or skip retry for streamed POSTs.
  const maxAttempts = input.body == null ? 2 : 1;

  let lastError: Error | undefined;
  let lastUpstream: Response | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      // Jittered backoff: 50–250ms before retry.
      await sleep(50 + Math.floor(Math.random() * 200));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const upstream = await fetch(url, {
        method: input.method,
        headers: buildUpstreamHeaders(input.headers, input.masterKey),
        body: input.body,
        signal: controller.signal,
        ...(input.body != null ? { duplex: "half" } : {}),
      } as RequestInit);

      clearTimeout(timer);

      // Retry on 5xx except 501 (Not Implemented — server won't change its mind).
      if (attempt < maxAttempts - 1 && upstream.status >= 500 && upstream.status !== 501) {
        // Store for fallback, then retry. Do not await body.cancel() —
        // it can hang with some fetch implementations; let GC handle it.
        lastUpstream = upstream;
        continue;
      }

      // Build outbound headers, stripping hop-by-hop.
      const headers = new Headers();
      for (const [k, v] of upstream.headers) {
        if (HOP_BY_HOP.has(k.toLowerCase())) continue;
        headers.set(k, v);
      }
      // Internal marker so handler.ts can log ourStatus vs upstreamStatus distinctly.
      // Stripped before the response reaches the consumer.
      headers.set("x-proxy-upstream-status", String(upstream.status));
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    } catch (err) {
      clearTimeout(timer);
      lastError = err as Error;
      // Network/timeout failure — don't retry (body may be partially consumed).
      break;
    }
  }

  // If we exhausted retries with a 5xx response, pass through the last one.
  if (lastUpstream && !lastError) {
    const headers = new Headers();
    for (const [k, v] of lastUpstream.headers) {
      if (HOP_BY_HOP.has(k.toLowerCase())) continue;
      headers.set(k, v);
    }
    headers.set("x-proxy-upstream-status", String(lastUpstream.status));
    return new Response(lastUpstream.body, {
      status: lastUpstream.status,
      statusText: lastUpstream.statusText,
      headers,
    });
  }

  // Network/timeout failure — synthesise a 502 envelope.
  const errRes = errorResponse({
    code: "upstream_error",
    status: 502,
    message: `Upstream Weeek call failed: ${lastError?.message ?? "unknown"}`,
    subKeyId: input.subKeyId,
    requestId: input.requestId ?? "unknown",
  });
  errRes.headers.set("x-proxy-upstream-status", "network_error");
  return errRes;
}
