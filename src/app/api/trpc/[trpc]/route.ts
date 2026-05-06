import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createTRPCContext } from "@/server/trpc/init";
import { appRouter } from "@/server/trpc/routers";
import { isOriginAllowed } from "@/server/trpc/origin-check";

function getAllowedOrigin(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

const handler = (req: Request) => {
  if (!isOriginAllowed(req, getAllowedOrigin())) {
    return new Response(JSON.stringify({ error: "origin_mismatch" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: (opts) => createTRPCContext(opts),
  });
};

export { handler as GET, handler as POST };
