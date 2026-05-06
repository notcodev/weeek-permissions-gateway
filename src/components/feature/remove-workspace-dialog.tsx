"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { WorkspacePublic } from "@/server/trpc/routers/workspace";

type Props = {
  workspace: WorkspacePublic | null;
  onClose: () => void;
  onRemoved: (id: string) => void;
};

export function RemoveWorkspaceDialog({ workspace, onClose, onRemoved }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const removeMutation = trpc.workspace.remove.useMutation({
    onSuccess: async (_data, variables) => {
      toast.success("Workspace removed");
      onRemoved(variables.id);
      await utils.workspace.list.invalidate();
      router.refresh();
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to remove workspace");
    },
  });

  const open = workspace !== null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (removeMutation.isPending) return;
        if (!next) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this workspace?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-mono">{workspace?.name}</span> will be deleted along with its
            encrypted master key. Sub-keys issued from it (when that lands) would be revoked. This
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removeMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={removeMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              if (!workspace) return;
              removeMutation.mutate({ id: workspace.id });
            }}
          >
            {removeMutation.isPending ? "Removing…" : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
