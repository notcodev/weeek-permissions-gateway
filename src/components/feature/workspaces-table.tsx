"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AddWorkspaceDialog } from "./add-workspace-dialog";
import { RemoveWorkspaceDialog } from "./remove-workspace-dialog";
import type { WorkspacePublic } from "@/server/trpc/routers/workspace";

type Props = {
  initialWorkspaces: WorkspacePublic[];
};

const fmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function WorkspacesTable({ initialWorkspaces }: Props) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [removing, setRemoving] = useState<WorkspacePublic | null>(null);

  const empty = workspaces.length === 0;

  const sorted = useMemo(
    () => [...workspaces].sort((a, b) => +b.createdAt - +a.createdAt),
    [workspaces],
  );

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Workspaces</h1>
          <p className="text-muted-foreground text-sm">
            Imported Weeek workspaces. Issue scoped sub-keys from each one.
          </p>
        </div>
        <AddWorkspaceDialog
          onCreated={(w) => setWorkspaces((curr) => [w, ...curr])}
          trigger={<Button>Add workspace</Button>}
        />
      </header>

      {empty ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-muted-foreground text-sm">
            No workspaces yet. Import one with a Weeek master API token.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Master key</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead>Imported</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">
                    <Link href={`/workspaces/${w.id}/keys`} className="hover:underline">
                      {w.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono">
                      …{w.masterKeyLast4}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {w.lastVerifiedAt ? fmt.format(new Date(w.lastVerifiedAt)) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {fmt.format(new Date(w.createdAt))}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" aria-label={`Actions for ${w.name}`}>
                          <span aria-hidden>⋯</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={(e) => {
                            e.preventDefault();
                            setRemoving(w);
                          }}
                        >
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RemoveWorkspaceDialog
        workspace={removing}
        onClose={() => setRemoving(null)}
        onRemoved={(id) => {
          setRemoving(null);
          setWorkspaces((curr) => curr.filter((w) => w.id !== id));
        }}
      />
    </section>
  );
}
