"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { WorkspacePublic } from "@/server/trpc/routers/workspace";

type Props = {
  workspaces: ReadonlyArray<WorkspacePublic>;
};

type Crumb = { label: string; href?: string };

function buildCrumbs(pathname: string, workspaces: ReadonlyArray<WorkspacePublic>): Crumb[] {
  if (pathname === "/dashboard") {
    return [{ label: "Dashboard" }];
  }
  if (pathname === "/presets") {
    return [{ label: "Presets" }];
  }

  const m = /^\/workspaces\/([^/]+)\/(keys|audit)$/.exec(pathname);
  if (m) {
    const id = m[1] ?? "";
    const section = m[2] ?? "";
    const ws = workspaces.find((w) => w.id === id);
    const wsLabel = ws?.name ?? "Workspace";
    return [
      { label: "Dashboard", href: "/dashboard" },
      { label: wsLabel, href: `/workspaces/${id}/keys` },
      { label: section === "keys" ? "Keys" : "Audit" },
    ];
  }

  if (pathname.startsWith("/accept-invitation/")) {
    return [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Accept invitation" },
    ];
  }

  return [{ label: "Dashboard", href: "/dashboard" }];
}

export function HeaderBreadcrumbs({ workspaces }: Props) {
  const pathname = usePathname() ?? "/";
  const crumbs = buildCrumbs(pathname, workspaces);
  const last = crumbs.length - 1;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((c, i) => (
          <React.Fragment key={`${i}-${c.label}`}>
            <BreadcrumbItem>
              {i === last || !c.href ? (
                <BreadcrumbPage>{c.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink href={c.href}>{c.label}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {i < last ? <BreadcrumbSeparator /> : null}
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
