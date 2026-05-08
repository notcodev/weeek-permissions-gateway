import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/feature/app-sidebar";
import { AppHeader } from "@/components/feature/app-header";
import { HeaderActionsProvider } from "@/components/feature/header-actions-context";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
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
        <HeaderActionsProvider>
          <AppHeader workspaces={workspaces} />
          <main className="flex-1 px-6 py-6">{children}</main>
        </HeaderActionsProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
