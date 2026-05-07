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
import { IssueSubKeyDialog } from "./issue-sub-key-dialog";
import { RevokeSubKeyDialog } from "./revoke-sub-key-dialog";
import { presetForVerbs } from "@/server/verbs";
import type { SubKeyPublic } from "@/server/trpc/routers/subKey";

type Props = {
  workspaceId: string;
  workspaceName: string;
  initialSubKeys: SubKeyPublic[];
};

const fmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function presetLabel(verbs: readonly string[]): string {
  switch (presetForVerbs(verbs)) {
    case "read-only":
      return "Read-only";
    case "task-automator":
      return "Task automator";
    case "full-access":
      return "Full access";
    default:
      return `${verbs.length} verbs`;
  }
}

export function SubKeysTable({ workspaceId, workspaceName, initialSubKeys }: Props) {
  const [keys, setKeys] = useState(initialSubKeys);
  const [revoking, setRevoking] = useState<SubKeyPublic | null>(null);

  const sorted = useMemo(() => [...keys].sort((a, b) => +b.createdAt - +a.createdAt), [keys]);
  const empty = keys.length === 0;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{workspaceName}</h1>
          <p className="text-muted-foreground text-sm">Sub-keys issued from this workspace.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/workspaces/${workspaceId}/audit`}>View audit log</Link>
          </Button>
          <IssueSubKeyDialog
            workspaceId={workspaceId}
            onIssued={(k) => setKeys((curr) => [k, ...curr])}
            trigger={<Button>Issue sub-key</Button>}
          />
        </div>
      </header>

      {empty ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-muted-foreground text-sm">
            No sub-keys yet. Issue one with a fixed-policy preset.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Preset</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.label}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {presetLabel(k.verbs)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono">
                      {k.prefix}…{k.last4}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={k.status === "revoked" ? "outline" : "secondary"}>
                      {k.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {fmt.format(new Date(k.createdAt))}
                  </TableCell>
                  <TableCell className="text-right">
                    {k.status === "active" ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" aria-label={`Actions for ${k.label}`}>
                            <span aria-hidden>⋯</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={(e) => {
                              e.preventDefault();
                              setRevoking(k);
                            }}
                          >
                            Revoke
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RevokeSubKeyDialog
        subKey={revoking}
        onClose={() => setRevoking(null)}
        onRevoked={(id) => {
          setRevoking(null);
          setKeys((curr) =>
            curr.map((k) => (k.id === id ? { ...k, status: "revoked", revokedAt: new Date() } : k)),
          );
        }}
      />
    </section>
  );
}
