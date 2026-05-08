import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { appRouter } from "@/server/trpc/routers";
import { PresetsManager } from "@/components/feature/presets-manager";

export const dynamic = "force-dynamic";

export default async function PresetsPage() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) redirect("/sign-in");

  const caller = appRouter.createCaller({ session, headers: reqHeaders });
  const presets = await caller.verbPreset.list();

  return <PresetsManager initialPresets={presets} />;
}
