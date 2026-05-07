import type { ProxyErrorCode } from "./types";

export type ErrorEnvelopeInput = {
  code: ProxyErrorCode;
  status: number;
  message: string;
  subKeyId?: string;
  requestId: string;
  /** Seconds until the rate-limit window expires; emitted as `Retry-After`. */
  retryAfterSec?: number;
};

export function errorResponse(input: ErrorEnvelopeInput): Response {
  const body = {
    error: {
      code: input.code,
      message: input.message,
      ...(input.subKeyId ? { subKeyId: input.subKeyId } : {}),
      requestId: input.requestId,
    },
  };
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (typeof input.retryAfterSec === "number" && input.retryAfterSec > 0) {
    headers["retry-after"] = String(input.retryAfterSec);
  }
  return new Response(JSON.stringify(body), {
    status: input.status,
    headers,
  });
}
