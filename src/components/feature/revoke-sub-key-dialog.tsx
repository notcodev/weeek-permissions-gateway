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
import type { SubKeyPublic } from "@/server/trpc/routers/subKey";

type Props = {
  subKey: SubKeyPublic | null;
  onClose: () => void;
  onRevoked: (id: string) => void;
};

export function RevokeSubKeyDialog({ subKey, onClose, onRevoked }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const revokeMutation = trpc.subKey.revoke.useMutation({
    onSuccess: async (_data, variables) => {
      toast.success("Sub-key revoked");
      onRevoked(variables.id);
      if (subKey) {
        await utils.subKey.listForWorkspace.invalidate({ workspaceId: subKey.workspaceId });
      }
      router.refresh();
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to revoke sub-key");
    },
  });

  const open = subKey !== null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (revokeMutation.isPending) return;
        if (!next) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke this sub-key?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium">{subKey?.label}</span> will stop authenticating requests
            immediately. Integrations using it will fail. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={revokeMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={revokeMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              if (!subKey) return;
              revokeMutation.mutate({ id: subKey.id });
            }}
          >
            {revokeMutation.isPending ? "Revoking…" : "Revoke"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
