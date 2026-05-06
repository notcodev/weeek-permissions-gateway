import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { appRouter } from "@/server/trpc/routers";
import { WorkspacesTable } from "@/components/feature/workspaces-table";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) redirect("/sign-in");

  const caller = appRouter.createCaller({ session, headers: reqHeaders });
  const workspaces = await caller.workspace.list();

  return <WorkspacesTable initialWorkspaces={workspaces} />;
}
