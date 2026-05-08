"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import type { WorkspacePublic } from "@/server/trpc/routers/workspace";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  masterKey: z
    .string()
    .trim()
    .min(8, "Master key looks too short")
    .max(2000, "Master key is unreasonably long"),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  onCreated: (workspace: WorkspacePublic) => void;
  trigger: ReactNode;
};

export function AddWorkspaceDialog({ onCreated, trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", masterKey: "" },
  });

  const importMutation = trpc.workspace.import.useMutation({
    onSuccess: async (workspace) => {
      toast.success(`Imported "${workspace.name}"`);
      onCreated(workspace);
      await utils.workspace.list.invalidate();
      router.refresh();
      setOpen(false);
      form.reset();
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to import workspace");
    },
  });

  const errors = form.formState.errors;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (importMutation.isPending) return;
        if (!next) form.reset();
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
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((values) => importMutation.mutate(values))}
        >
          <FieldGroup>
            <Field data-invalid={!!errors.name || undefined}>
              <FieldLabel htmlFor="ws-name">Name</FieldLabel>
              <Input
                id="ws-name"
                placeholder="Personal Weeek"
                autoComplete="off"
                maxLength={80}
                aria-invalid={!!errors.name || undefined}
                {...form.register("name")}
              />
              <FieldError>{errors.name?.message}</FieldError>
            </Field>

            <Field data-invalid={!!errors.masterKey || undefined}>
              <FieldLabel htmlFor="ws-key">Master API token</FieldLabel>
              <Input
                id="ws-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                placeholder="wk_…"
                aria-invalid={!!errors.masterKey || undefined}
                {...form.register("masterKey")}
              />
              <FieldDescription>
                Get one in Weeek → Settings → API. We store only an encrypted copy plus the last 4
                characters for display.
              </FieldDescription>
              <FieldError>{errors.masterKey?.message}</FieldError>
            </Field>
          </FieldGroup>

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
