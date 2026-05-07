import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { auth } from "@/server/auth";
import { appRouter } from "@/server/trpc/routers";
import { AuditLogViewer } from "@/components/feature/audit-log-viewer";

export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function WorkspaceAuditPage({ params }: { params: Promise<Params> }) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) redirect("/sign-in");

  const { id } = await params;
  const caller = appRouter.createCaller({ session, headers: reqHeaders });

  let workspaceName = "";
  let subKeys: Awaited<ReturnType<typeof caller.subKey.listForWorkspace>>;
  try {
    const list = await caller.workspace.list();
    const ws = list.find((w) => w.id === id);
    if (!ws) notFound();
    workspaceName = ws.name;
    subKeys = await caller.subKey.listForWorkspace({ workspaceId: id });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return <AuditLogViewer workspaceId={id} workspaceName={workspaceName} subKeys={subKeys} />;
}
