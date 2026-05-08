"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc-client";
import type { VerbPresetPublic } from "@/server/trpc/routers/verbPreset";
import { EditPresetDialog } from "./edit-preset-dialog";

type Props = {
  initialPresets: VerbPresetPublic[];
};

const fmtDate = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function PresetsManager({ initialPresets }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const presetsQ = trpc.verbPreset.list.useQuery(undefined, { initialData: initialPresets });
  const presets = presetsQ.data ?? [];

  const [editing, setEditing] = useState<VerbPresetPublic | null>(null);
  const [deleting, setDeleting] = useState<VerbPresetPublic | null>(null);

  const removeMutation = trpc.verbPreset.remove.useMutation({
    onSuccess: async () => {
      toast.success("Preset deleted");
      setDeleting(null);
      await utils.verbPreset.list.invalidate();
      router.refresh();
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to delete preset");
    },
  });

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Presets</h1>
        <p className="text-muted-foreground text-sm">
          Reusable verb selections you can apply when issuing sub-keys. Built-in presets are not
          shown here — they always exist alongside yours in the issue dialog.
        </p>
      </header>

      {presets.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No presets yet</CardTitle>
            <CardDescription>
              Save your first preset from the verb step in the issue-sub-key wizard.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Go to dashboard
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Verbs</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {presets.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {p.verbs.map((v) => (
                        <Badge key={v} variant="secondary" className="font-mono text-xs">
                          {v}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {fmtDate.format(new Date(p.updatedAt))}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${p.name}`}
                        onClick={() => setEditing(p)}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${p.name}`}
                        onClick={() => setDeleting(p)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EditPresetDialog
        key={editing?.id ?? "none"}
        preset={editing}
        onClose={() => setEditing(null)}
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete preset</AlertDialogTitle>
            <AlertDialogDescription>
              Delete preset &quot;{deleting?.name}&quot;? Sub-keys already issued from this preset
              keep their verbs — only the preset itself is removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeMutation.isPending}
              onClick={() => {
                if (deleting) removeMutation.mutate({ id: deleting.id });
              }}
            >
              {removeMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
