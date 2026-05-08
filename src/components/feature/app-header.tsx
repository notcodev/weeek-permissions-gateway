"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { HeaderBreadcrumbs } from "./header-breadcrumbs";
import { useHeaderActions } from "./header-actions-context";
import type { WorkspacePublic } from "@/server/trpc/routers/workspace";

type Props = {
  workspaces: ReadonlyArray<WorkspacePublic>;
};

export function AppHeader({ workspaces }: Props) {
  const actions = useHeaderActions();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-2 data-vertical:h-4 data-vertical:self-auto"
      />
      <HeaderBreadcrumbs workspaces={workspaces} />
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </header>
  );
}
