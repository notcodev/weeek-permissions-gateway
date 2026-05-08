"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { SubKeyRevealModal } from "./sub-key-reveal-modal";
import { ProjectsStep } from "./projects-step";
import { BoardsStep } from "./boards-step";
import { IdentityStep } from "./identity-step";
import { VerbsStep } from "./verbs-step";
import { VERB_CATALOG } from "@/server/verbs";

const VERB_NAMES: ReadonlyArray<string> = VERB_CATALOG;
import type { SubKeyPublic } from "@/server/trpc/routers/subKey";

type Props = {
  workspaceId: string;
  onIssued: (subKey: SubKeyPublic) => void;
  trigger: ReactNode;
};

type Step = 1 | 2 | 3 | 4 | 5;

const wizardSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(80),
  boundWeeekUserId: z.string().nullable(),
  boundWeeekUserName: z.string().nullable(),
  visibilityBound: z.boolean(),
  authorRewrite: z.boolean(),
  scopeProjects: z.array(z.string()).min(1, "Pick at least one project (or 'all')"),
  scopeBoards: z.array(z.string()).min(1, "Pick at least one board (or 'all')"),
  verbs: z
    .array(z.string())
    .min(1, "Pick at least one verb")
    .refine((arr) => arr.every((v) => VERB_NAMES.includes(v)), "One or more verbs are unknown"),
});

export type WizardForm = z.infer<typeof wizardSchema>;

const DEFAULT_VALUES: WizardForm = {
  label: "",
  boundWeeekUserId: null,
  boundWeeekUserName: null,
  visibilityBound: false,
  authorRewrite: false,
  scopeProjects: ["*"],
  scopeBoards: ["*"],
  verbs: [],
};

const STEP_FIELDS: Record<Step, ReadonlyArray<keyof WizardForm>> = {
  1: ["label"],
  2: ["scopeProjects"],
  3: ["scopeBoards"],
  4: ["verbs"],
  5: [],
};

export function IssueSubKeyDialog({ workspaceId, onIssued, trigger }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [revealKey, setRevealKey] = useState<string | null>(null);

  const form = useForm<WizardForm>({
    resolver: zodResolver(wizardSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onTouched",
  });

  const createMutation = trpc.subKey.create.useMutation({
    onSuccess: async ({ subKey, rawKey }) => {
      toast.success(`Issued "${subKey.label}"`);
      onIssued(subKey);
      await utils.subKey.listForWorkspace.invalidate({ workspaceId });
      router.refresh();
      setRevealKey(rawKey);
      reset();
      setOpen(false);
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to issue sub-key");
    },
  });

  function reset(): void {
    setStep(1);
    form.reset(DEFAULT_VALUES);
  }

  async function next(): Promise<void> {
    const ok = await form.trigger(STEP_FIELDS[step]);
    if (!ok) return;
    setStep((step + 1) as Step);
  }

  function back(): void {
    setStep(Math.max(1, step - 1) as Step);
  }

  function previewPolicy(values: WizardForm): string {
    return JSON.stringify(
      {
        label: values.label,
        bound_weeek_user_id: values.boundWeeekUserId,
        bound_weeek_user_name: values.boundWeeekUserName,
        visibility_bound: values.visibilityBound,
        author_rewrite: values.authorRewrite,
        scope_projects: [...values.scopeProjects],
        scope_boards: [...values.scopeBoards],
        verbs: [...values.verbs],
      },
      null,
      2,
    );
  }

  function onSubmit(values: WizardForm): void {
    if (step !== 5) return;
    createMutation.mutate({
      workspaceId,
      label: values.label.trim(),
      verbs: [...values.verbs],
      scopeProjects: [...values.scopeProjects],
      scopeBoards: [...values.scopeBoards],
      boundWeeekUserId: values.boundWeeekUserId,
      boundWeeekUserName: values.boundWeeekUserName,
      visibilityBound: values.visibilityBound,
      authorRewrite: values.authorRewrite,
    });
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (createMutation.isPending) return;
          if (!nextOpen) reset();
          setOpen(nextOpen);
        }}
      >
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Issue a sub-key</DialogTitle>
            <DialogDescription>
              Step {step} of 5:{" "}
              {step === 1
                ? "Identity"
                : step === 2
                  ? "Projects"
                  : step === 3
                    ? "Boards"
                    : step === 4
                      ? "Verbs"
                      : "Review"}
            </DialogDescription>
          </DialogHeader>

          <FormProvider {...form}>
            {/*
              Wizard does NOT submit through the <form> element. Multi-step
              dialogs that wrap RadixUI primitives (Combobox triggers, Dialog
              close buttons, Select triggers) tend to auto-submit on stray
              clicks because those inner buttons inherit the HTML default
              type="submit" inside a <form>. Swallow every native submit
              event here; the only path to the create mutation is the
              "Create sub-key" button's onClick → form.handleSubmit on
              step 4.
            */}
            <form onSubmit={(e) => e.preventDefault()} noValidate>
              {step === 1 ? <IdentityStep workspaceId={workspaceId} /> : null}

              {step === 2 ? <ProjectsStep workspaceId={workspaceId} /> : null}

              {step === 3 ? <BoardsStep workspaceId={workspaceId} /> : null}

              {step === 4 ? <VerbsStep /> : null}

              {step === 5 ? (
                <FieldGroup>
                  <Field>
                    <FieldLabel asChild>
                      <span>Policy preview</span>
                    </FieldLabel>
                    <pre className="bg-muted max-h-64 overflow-auto rounded-md border px-3 py-2 font-mono text-xs">
                      {previewPolicy(form.getValues())}
                    </pre>
                    <FieldDescription>
                      The raw key will be shown exactly once after you confirm.
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              ) : null}
            </form>
            <DialogFooter className="justify-between sm:justify-between">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={back}
                  disabled={createMutation.isPending}
                >
                  Back
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    reset();
                    setOpen(false);
                  }}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
              )}
              {step < 5 ? (
                <Button type="button" onClick={next}>
                  Next
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Issuing…" : "Create sub-key"}
                </Button>
              )}
            </DialogFooter>
          </FormProvider>
        </DialogContent>
      </Dialog>

      <SubKeyRevealModal rawKey={revealKey} onClose={() => setRevealKey(null)} />
    </>
  );
}
