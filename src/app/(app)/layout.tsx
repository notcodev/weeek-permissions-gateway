import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/feature/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { auth } from "@/server/auth";
import { appRouter } from "@/server/trpc/routers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) redirect("/sign-in");

  const caller = appRouter.createCaller({ session, headers: reqHeaders });
  const [orgs, workspaces] = await Promise.all([caller.org.list(), caller.workspace.list()]);
  const activeOrganizationId =
    (session as { session?: { activeOrganizationId?: string | null } }).session
      ?.activeOrganizationId ?? null;

  return (
    <SidebarProvider>
      <AppSidebar
        user={{
          id: session.user.id,
          name: session.user.name ?? null,
          email: session.user.email,
        }}
        orgs={orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug, role: o.role }))}
        activeOrganizationId={activeOrganizationId}
        workspaces={workspaces}
      />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <span className="text-sm font-semibold">Weeek Permissions Gateway</span>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
