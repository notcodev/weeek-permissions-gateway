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
import { SubKeyRevealModal } from "./sub-key-reveal-modal";
import { ScopeStep } from "./scope-step";
import { expandPreset, type PresetKey } from "@/server/verbs";
import type { SubKeyPublic } from "@/server/trpc/routers/subKey";

type Props = {
  workspaceId: string;
  onIssued: (subKey: SubKeyPublic) => void;
  trigger: ReactNode;
};

type Step = 1 | 2 | 3 | 4;

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
  const [label, setLabel] = useState("");
  const [preset, setPreset] = useState<PresetKey>("read-only");
  const [scopeProjects, setScopeProjects] = useState<readonly string[]>(["*"]);
  const [scopeBoards, setScopeBoards] = useState<readonly string[]>(["*"]);
  const [revealKey, setRevealKey] = useState<string | null>(null);

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

  function reset() {
    setStep(1);
    setLabel("");
    setPreset("read-only");
    setScopeProjects(["*"]);
    setScopeBoards(["*"]);
  }

  function previewPolicy() {
    return JSON.stringify(
      {
        label,
        preset,
        scope_projects: [...scopeProjects],
        scope_boards: [...scopeBoards],
        verbs: [...expandPreset(preset)],
      },
      null,
      2,
    );
  }

  const scopeValid = scopeProjects.length > 0 && scopeBoards.length > 0;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (createMutation.isPending) return;
          if (!next) reset();
          setOpen(next);
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

          {step === 1 ? (
            <div className="grid gap-2">
              <Label htmlFor="sk-label">Label</Label>
              <Input
                id="sk-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="CI bot"
                autoComplete="off"
                maxLength={80}
                required
              />
              <p className="text-muted-foreground text-xs">
                Shown in the dashboard and in audit log; not embedded in the key itself.
              </p>
            </div>
          ) : null}

          {step === 2 ? (
            <ScopeStep
              workspaceId={workspaceId}
              scopeProjects={scopeProjects}
              scopeBoards={scopeBoards}
              onChange={({ scopeProjects: p, scopeBoards: b }) => {
                setScopeProjects(p);
                setScopeBoards(b);
              }}
            />
          ) : null}

          {step === 3 ? (
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground text-sm">
                Pick a preset. Custom verb selection arrives in a later phase.
              </p>
              {PRESET_OPTIONS.map((opt) => (
                <label
                  key={opt.key}
                  className={`flex cursor-pointer flex-col gap-1 rounded-md border p-3 ${
                    preset === opt.key ? "border-foreground" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="preset"
                      value={opt.key}
                      checked={preset === opt.key}
                      onChange={() => setPreset(opt.key)}
                    />
                    <span className="font-medium">{opt.title}</span>
                  </span>
                  <span className="text-muted-foreground text-sm">{opt.blurb}</span>
                </label>
              ))}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="grid gap-2">
              <Label>Policy preview</Label>
              <pre className="bg-muted max-h-64 overflow-auto rounded-md border px-3 py-2 font-mono text-xs">
                {previewPolicy()}
              </pre>
              <p className="text-muted-foreground text-xs">
                The raw key will be shown exactly once after you confirm.
              </p>
            </div>
          ) : null}

          <DialogFooter className="justify-between sm:justify-between">
            {step > 1 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(((step - 1) as Step) || 1)}
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
              <Button
                type="button"
                disabled={
                  (step === 1 && label.trim().length === 0) ||
                  (step === 2 && !scopeValid)
                }
                onClick={() => setStep(((step + 1) as Step) || 4)}
              >
                Next
              </Button>
            ) : (
              <Button
                type="button"
                disabled={createMutation.isPending}
                onClick={() =>
                  createMutation.mutate({
                    workspaceId,
                    label: label.trim(),
                    preset,
                    scopeProjects: [...scopeProjects],
                    scopeBoards: [...scopeBoards],
                  })
                }
              >
                {createMutation.isPending ? "Issuing…" : "Create sub-key"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SubKeyRevealModal rawKey={revealKey} onClose={() => setRevealKey(null)} />
    </>
  );
}
