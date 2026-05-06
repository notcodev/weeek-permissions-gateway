"use client";
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/trpc/routers";

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClientConfig() {
  return {
    links: [
      httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: (url, opts) => fetch(url, { ...opts, credentials: "include" }),
      }),
    ],
  };
}
