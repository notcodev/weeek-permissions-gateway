import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { appRouter } from "@/server/trpc/routers";
import { SubKeysTable } from "@/components/feature/sub-keys-table";
import { TRPCError } from "@trpc/server";

export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function WorkspaceKeysPage({ params }: { params: Promise<Params> }) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) redirect("/sign-in");

  const { id } = await params;
  const caller = appRouter.createCaller({ session, headers: reqHeaders });

  // Fetch workspace + sub-keys side-by-side. Both endpoints throw NOT_FOUND for
  // a workspace that doesn't belong to the caller; we render a 404 page in
  // that case.
  let workspaceName = "";
  let initialSubKeys: Awaited<ReturnType<typeof caller.subKey.listForWorkspace>>;
  try {
    const list = await caller.workspace.list();
    const ws = list.find((w) => w.id === id);
    if (!ws) notFound();
    workspaceName = ws.name;
    initialSubKeys = await caller.subKey.listForWorkspace({ workspaceId: id });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <SubKeysTable workspaceId={id} workspaceName={workspaceName} initialSubKeys={initialSubKeys} />
  );
}
