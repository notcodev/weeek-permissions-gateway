"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc-client";
import { VERB_CATALOG, type Verb } from "@/server/verbs";
import type { VerbPresetPublic } from "@/server/trpc/routers/verbPreset";

type Props = {
  preset: VerbPresetPublic | null;
  onClose: () => void;
};

type Group = { key: string; title: string; verbs: Verb[] };

const VERB_GROUPS: ReadonlyArray<Group> = (() => {
  const byResource = new Map<string, Verb[]>();
  for (const v of VERB_CATALOG) {
    const [resource] = v.split(":");
    if (!resource) continue;
    const arr = byResource.get(resource) ?? [];
    arr.push(v);
    byResource.set(resource, arr);
  }
  const titleByResource: Record<string, string> = {
    projects: "Projects",
    boards: "Boards",
    tasks: "Tasks",
    members: "Members",
    custom_fields: "Custom fields",
    time_entries: "Time entries",
  };
  return Array.from(byResource.entries()).map(([k, v]) => ({
    key: k,
    title: titleByResource[k] ?? k,
    verbs: v,
  }));
})();

function actionLabel(action: string): string {
  if (action === "read") return "Read";
  if (action === "write") return "Write";
  if (action === "delete") return "Delete";
  return action.charAt(0).toUpperCase() + action.slice(1);
}

export function EditPresetDialog({ preset, onClose }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  // Parent gives us a fresh `key` per preset, so lazy-init from the prop is
  // safe — no need for an effect to keep state in sync with prop changes.
  const [name, setName] = useState(preset?.name ?? "");
  const [verbs, setVerbs] = useState<Verb[]>(() =>
    preset ? VERB_CATALOG.filter((v) => preset.verbs.includes(v)) : [],
  );
  const [nameError, setNameError] = useState<string | null>(null);

  const verbSet = useMemo(() => new Set(verbs), [verbs]);

  const updateMutation = trpc.verbPreset.update.useMutation({
    onSuccess: async () => {
      toast.success("Preset updated");
      await utils.verbPreset.list.invalidate();
      router.refresh();
      onClose();
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to update preset");
    },
  });

  function toggleVerb(v: Verb, checked: boolean): void {
    const next = new Set(verbSet);
    if (checked) next.add(v);
    else next.delete(v);
    setVerbs(VERB_CATALOG.filter((x) => next.has(x)));
  }

  function setGroup(g: Group, action: "all" | "none"): void {
    const next = new Set(verbSet);
    if (action === "all") for (const v of g.verbs) next.add(v);
    if (action === "none") for (const v of g.verbs) next.delete(v);
    setVerbs(VERB_CATALOG.filter((x) => next.has(x)));
  }

  function onSave(): void {
    if (!preset) return;
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 60) {
      setNameError("Name must be 1-60 characters");
      return;
    }
    if (verbs.length === 0) {
      toast.error("Pick at least one verb");
      return;
    }
    setNameError(null);
    updateMutation.mutate({ id: preset.id, name: trimmed, verbs: [...verbs] });
  }

  return (
    <Dialog
      open={preset !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit preset</DialogTitle>
          <DialogDescription>
            Existing sub-keys aren&apos;t affected — they keep the verbs they were issued with.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field data-invalid={nameError !== null || undefined}>
            <FieldLabel htmlFor="preset-name">Name</FieldLabel>
            <Input
              id="preset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              aria-invalid={nameError !== null || undefined}
            />
            {nameError ? <FieldError>{nameError}</FieldError> : null}
          </Field>

          {VERB_GROUPS.map((g) => {
            const allOn = g.verbs.every((v) => verbSet.has(v));
            return (
              <FieldSet key={g.key}>
                <div className="flex items-center justify-between">
                  <FieldLegend variant="label">{g.title}</FieldLegend>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => setGroup(g, allOn ? "none" : "all")}
                  >
                    {allOn ? "Clear all" : "Select all"}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {g.verbs.map((v) => {
                    const id = `edit-verb-${v.replace(/[^\w-]/g, "_")}`;
                    const action = v.split(":")[1] ?? v;
                    return (
                      <Field key={v} orientation="horizontal" className="py-0.5">
                        <Checkbox
                          id={id}
                          checked={verbSet.has(v)}
                          onCheckedChange={(c) => toggleVerb(v, c === true)}
                        />
                        <FieldLabel htmlFor={id} className="font-normal">
                          {actionLabel(action)}
                        </FieldLabel>
                      </Field>
                    );
                  })}
                </div>
              </FieldSet>
            );
          })}

          <FieldDescription>
            {verbs.length} of {VERB_CATALOG.length} verbs selected.
          </FieldDescription>
        </FieldGroup>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={updateMutation.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
