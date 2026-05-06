const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalise(origin: string): string {
  return origin.replace(/\/+$/, "");
}

export function isOriginAllowed(req: Request, allowed: string): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return true;
  const origin = req.headers.get("origin");
  if (origin === null) return true;
  return normalise(origin) === normalise(allowed);
}
