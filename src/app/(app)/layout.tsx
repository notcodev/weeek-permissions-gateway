import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/feature/sign-out-button";
import { OwnerContextSwitcher } from "@/components/feature/owner-context-switcher";
import { auth } from "@/server/auth";
import { appRouter } from "@/server/trpc/routers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) redirect("/sign-in");

  const caller = appRouter.createCaller({ session, headers: reqHeaders });
  const orgs = await caller.org.list();
  const activeOrganizationId =
    (session as { session?: { activeOrganizationId?: string | null } }).session
      ?.activeOrganizationId ?? null;

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link href="/dashboard" className="font-semibold">
          Weeek Permissions Gateway
        </Link>
        <div className="flex items-center gap-2">
          <OwnerContextSwitcher
            activeOrganizationId={activeOrganizationId}
            orgs={orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug, role: o.role }))}
          />
          <SignOutButton />
        </div>
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
