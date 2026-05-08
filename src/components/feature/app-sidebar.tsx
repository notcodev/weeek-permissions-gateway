"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRightIcon,
  ChevronsUpDownIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  PlusIcon,
  ScrollTextIcon,
  ShieldIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { signOut } from "@/lib/auth-client";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import type { WorkspacePublic } from "@/server/trpc/routers/workspace";

type OrgOption = { id: string; name: string; slug: string; role: string };

type User = { id: string; name: string | null; email: string };

type Props = {
  user: User;
  orgs: ReadonlyArray<OrgOption>;
  activeOrganizationId: string | null;
  workspaces: ReadonlyArray<WorkspacePublic>;
};

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function AppSidebar({ user, orgs, activeOrganizationId, workspaces }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <ContextSwitcher
          activeOrganizationId={activeOrganizationId}
          orgs={orgs}
          router={router}
        />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/dashboard"} tooltip="Dashboard">
                <Link href="/dashboard">
                  <LayoutDashboardIcon />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
          <SidebarMenu>
            {workspaces.length === 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="text-sidebar-foreground/60"
                  tooltip="No workspaces yet"
                >
                  <PlusIcon />
                  <span>No workspaces yet</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : (
              workspaces.map((w) => {
                const onWs = pathname.startsWith(`/workspaces/${w.id}`);
                return (
                  <Collapsible
                    key={w.id}
                    asChild
                    defaultOpen={onWs}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={w.name}>
                          <ShieldIcon />
                          <span className="truncate">{w.name}</span>
                          <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname === `/workspaces/${w.id}/keys`}
                            >
                              <Link href={`/workspaces/${w.id}/keys`}>
                                <KeyRoundIcon />
                                <span>Keys</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname === `/workspaces/${w.id}/audit`}
                            >
                              <Link href={`/workspaces/${w.id}/audit`}>
                                <ScrollTextIcon />
                                <span>Audit</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} router={router} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function ContextSwitcher({
  activeOrganizationId,
  orgs,
  router,
}: {
  activeOrganizationId: string | null;
  orgs: ReadonlyArray<OrgOption>;
  router: ReturnType<typeof useRouter>;
}) {
  const { isMobile } = useSidebar();
  const [pending, setPending] = React.useState(false);
  const active = activeOrganizationId
    ? (orgs.find((o) => o.id === activeOrganizationId) ?? null)
    : null;
  const label = active ? active.name : "Personal";
  const sublabel = active ? active.role : "Owner";

  async function switchTo(orgId: string | null) {
    if (orgId === activeOrganizationId) return;
    setPending(true);
    try {
      const { error } = orgId
        ? await authClient.organization.setActive({ organizationId: orgId })
        : await authClient.organization.setActive({ organizationId: null });
      if (error) {
        toast.error(error.message ?? "Failed to switch context");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              disabled={pending}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <ShieldIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{label}</span>
                <span className="text-muted-foreground truncate text-xs">{sublabel}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Switch context
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => switchTo(null)}>
              <span className={activeOrganizationId === null ? "font-semibold" : undefined}>
                Personal
              </span>
            </DropdownMenuItem>
            {orgs.length > 0 ? <DropdownMenuSeparator /> : null}
            {orgs.map((o) => (
              <DropdownMenuItem key={o.id} onClick={() => switchTo(o.id)}>
                <div className="flex flex-col">
                  <span className={o.id === activeOrganizationId ? "font-semibold" : undefined}>
                    {o.name}
                  </span>
                  <span className="text-muted-foreground text-xs">{o.role}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function NavUser({
  user,
  router,
}: {
  user: User;
  router: ReturnType<typeof useRouter>;
}) {
  const { isMobile } = useSidebar();
  const [pending, setPending] = React.useState(false);
  const display = user.name ?? user.email;

  async function onSignOut() {
    setPending(true);
    try {
      await signOut();
      router.push("/sign-in");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              disabled={pending}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{initials(display)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{display}</span>
                <span className="text-muted-foreground truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{initials(display)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{display}</span>
                  <span className="text-muted-foreground truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut} disabled={pending}>
              <LogOutIcon />
              {pending ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
