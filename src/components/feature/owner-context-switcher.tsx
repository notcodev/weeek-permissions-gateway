"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type OrgOption = { id: string; name: string; slug: string; role: string };

type Props = {
  /** Active org id from `session.session.activeOrganizationId`; null = personal */
  activeOrganizationId: string | null;
  /** Orgs the user belongs to. */
  orgs: ReadonlyArray<OrgOption>;
};

export function OwnerContextSwitcher({ activeOrganizationId, orgs }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const active = activeOrganizationId
    ? orgs.find((o) => o.id === activeOrganizationId)
    : null;
  const label = active ? active.name : "Personal";

  async function switchTo(orgId: string | null) {
    if (orgId === activeOrganizationId) return;
    setPending(true);
    try {
      // Better Auth's setActive accepts `null` (clear) or an org id.
      const { error } = orgId
        ? await authClient.organization.setActive({ organizationId: orgId })
        : await authClient.organization.setActive({ organizationId: null });
      if (error) {
        toast.error(error.message ?? "Failed to switch context");
        return;
      }
      // Reload server components so workspace lists, audit, etc. requery in
      // the new owner context.
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending} className="font-normal">
          <span className="text-muted-foreground mr-2 text-xs uppercase">Context</span>
          <span className="font-medium">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Switch context</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => switchTo(null)}
          className={activeOrganizationId === null ? "font-semibold" : undefined}
        >
          Personal
        </DropdownMenuItem>
        {orgs.length > 0 ? <DropdownMenuSeparator /> : null}
        {orgs.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onSelect={() => switchTo(o.id)}
            className={o.id === activeOrganizationId ? "font-semibold" : undefined}
          >
            <div className="flex flex-col">
              <span>{o.name}</span>
              <span className="text-muted-foreground text-xs">{o.role}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
