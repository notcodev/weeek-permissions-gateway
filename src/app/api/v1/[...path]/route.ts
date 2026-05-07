import { randomUUID } from "node:crypto";
import { errorResponse } from "@/server/proxy/errors";
import { proxy } from "@/server/proxy/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 10 * 1024 * 1024;

function checkBodySize(req: Request): Response | null {
  const cl = req.headers.get("content-length");
  if (!cl) return null;
  const n = Number.parseInt(cl, 10);
  if (Number.isFinite(n) && n > MAX_BODY_BYTES) {
    return errorResponse({
      code: "body_too_large",
      status: 413,
      message: `Request body exceeds ${MAX_BODY_BYTES} bytes`,
      requestId: randomUUID(),
    });
  }
  return null;
}

async function handle(req: Request): Promise<Response> {
  const tooBig = checkBodySize(req);
  if (tooBig) return tooBig;
  return proxy(req);
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
