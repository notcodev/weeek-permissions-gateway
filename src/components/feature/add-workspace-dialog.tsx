"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkspacePublic } from "@/server/trpc/routers/workspace";

type Props = {
  onCreated: (workspace: WorkspacePublic) => void;
  trigger: ReactNode;
};

export function AddWorkspaceDialog({ onCreated, trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const importMutation = trpc.workspace.import.useMutation({
    onSuccess: async (workspace) => {
      toast.success(`Imported "${workspace.name}"`);
      onCreated(workspace);
      await utils.workspace.list.invalidate();
      router.refresh();
      setOpen(false);
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to import workspace");
    },
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const masterKey = String(form.get("masterKey") ?? "").trim();
    if (!name || !masterKey) return;
    importMutation.mutate({ name, masterKey });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (importMutation.isPending) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import a Weeek workspace</DialogTitle>
          <DialogDescription>
            Paste a Weeek master API token. We validate it against Weeek before storing it, then
            encrypt it at rest. The token is never written to logs.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              name="name"
              required
              placeholder="Personal Weeek"
              autoComplete="off"
              maxLength={80}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ws-key">Master API token</Label>
            <Input
              id="ws-key"
              name="masterKey"
              required
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              placeholder="wk_…"
            />
            <p className="text-muted-foreground text-xs">
              Get one in Weeek → Settings → API. We store only an encrypted copy plus the last 4
              characters for display.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={importMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={importMutation.isPending}>
              {importMutation.isPending ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
