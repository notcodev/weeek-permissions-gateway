import type { ProxyErrorCode } from "./types";

export type ErrorEnvelopeInput = {
  code: ProxyErrorCode;
  status: number;
  message: string;
  subKeyId?: string;
  requestId: string;
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
  return new Response(JSON.stringify(body), {
    status: input.status,
    headers: { "content-type": "application/json" },
  });
}
