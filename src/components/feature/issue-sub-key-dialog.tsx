"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Controller, FormProvider, useForm } from "react-hook-form";
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SubKeyRevealModal } from "./sub-key-reveal-modal";
import { ScopeStep } from "./scope-step";
import { IdentityStep } from "./identity-step";
import { expandPreset, type PresetKey } from "@/server/verbs";
import type { SubKeyPublic } from "@/server/trpc/routers/subKey";

type Props = {
  workspaceId: string;
  onIssued: (subKey: SubKeyPublic) => void;
  trigger: ReactNode;
};

type Step = 1 | 2 | 3 | 4;

const wizardSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(80),
  boundWeeekUserId: z.string().nullable(),
  boundWeeekUserName: z.string().nullable(),
  visibilityBound: z.boolean(),
  authorRewrite: z.boolean(),
  scopeProjects: z.array(z.string()).min(1, "Pick at least one project (or 'all')"),
  scopeBoards: z.array(z.string()).min(1, "Pick at least one board (or 'all')"),
  preset: z.enum(["read-only", "task-automator", "full-access"]),
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
  preset: "read-only",
};

const STEP_FIELDS: Record<Step, ReadonlyArray<keyof WizardForm>> = {
  1: ["label"],
  2: ["scopeProjects", "scopeBoards"],
  3: ["preset"],
  4: [],
};

const PRESET_OPTIONS: ReadonlyArray<{
  key: PresetKey;
  title: string;
  blurb: string;
}> = [
  {
    key: "read-only",
    title: "Read-only",
    blurb: "Read every resource. No writes, no deletes.",
  },
  {
    key: "task-automator",
    title: "Task automator",
    blurb: "Read everything; create/update tasks and comments; complete + move tasks; log time.",
  },
  {
    key: "full-access",
    title: "Full access",
    blurb: "Every verb in the catalogue, including deletes.",
  },
];

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
    setStep(((step - 1) || 1) as Step);
  }

  function previewPolicy(values: WizardForm): string {
    return JSON.stringify(
      {
        label: values.label,
        preset: values.preset,
        bound_weeek_user_id: values.boundWeeekUserId,
        bound_weeek_user_name: values.boundWeeekUserName,
        visibility_bound: values.visibilityBound,
        author_rewrite: values.authorRewrite,
        scope_projects: [...values.scopeProjects],
        scope_boards: [...values.scopeBoards],
        verbs: [...expandPreset(values.preset)],
      },
      null,
      2,
    );
  }

  function onSubmit(values: WizardForm): void {
    createMutation.mutate({
      workspaceId,
      label: values.label.trim(),
      preset: values.preset,
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Issue a sub-key</DialogTitle>
            <DialogDescription>
              Step {step} of 4:{" "}
              {step === 1
                ? "Identity"
                : step === 2
                  ? "Scope"
                  : step === 3
                    ? "Verbs"
                    : "Review"}
            </DialogDescription>
          </DialogHeader>

          <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              {step === 1 ? <IdentityStep workspaceId={workspaceId} /> : null}

              {step === 2 ? <ScopeStep workspaceId={workspaceId} /> : null}

              {step === 3 ? (
                <Controller
                  control={form.control}
                  name="preset"
                  render={({ field }) => (
                    <FieldGroup>
                      <FieldDescription>
                        Pick a preset. Custom verb selection arrives in a later phase.
                      </FieldDescription>
                      <RadioGroup
                        value={field.value}
                        onValueChange={(v) => field.onChange(v as PresetKey)}
                        className="grid gap-3"
                      >
                        {PRESET_OPTIONS.map((opt) => (
                          <FieldLabel key={opt.key} htmlFor={`sk-preset-${opt.key}`}>
                            <Field orientation="horizontal">
                              <RadioGroupItem id={`sk-preset-${opt.key}`} value={opt.key} />
                              <FieldContent>
                                <FieldTitle>{opt.title}</FieldTitle>
                                <FieldDescription>{opt.blurb}</FieldDescription>
                              </FieldContent>
                            </Field>
                          </FieldLabel>
                        ))}
                      </RadioGroup>
                    </FieldGroup>
                  )}
                />
              ) : null}

              {step === 4 ? (
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
                {step < 4 ? (
                  <Button type="button" onClick={next}>
                    Next
                  </Button>
                ) : (
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Issuing…" : "Create sub-key"}
                  </Button>
                )}
              </DialogFooter>
            </form>
          </FormProvider>
        </DialogContent>
      </Dialog>

      <SubKeyRevealModal rawKey={revealKey} onClose={() => setRevealKey(null)} />
    </>
  );
}
