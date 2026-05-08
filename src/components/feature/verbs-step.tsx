"use client";

import { useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { BookmarkPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc-client";
import { VERB_CATALOG, VERB_PRESETS, type Verb } from "@/server/verbs";
import type { WizardForm } from "./issue-sub-key-dialog";

type Group = {
  key: string;
  title: string;
  verbs: Verb[];
};

// Stable display order; deny verbs not in the catalogue.
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

const BUILTIN_PRESET_LABEL: Record<keyof typeof VERB_PRESETS, string> = {
  "read-only": "Read-only (built-in)",
  "task-automator": "Task automator (built-in)",
  "full-access": "Full access (built-in)",
};

const PRESET_NONE = "__none__";

function actionLabel(action: string): string {
  if (action === "read") return "Read";
  if (action === "write") return "Write";
  if (action === "delete") return "Delete";
  return action.charAt(0).toUpperCase() + action.slice(1);
}

export function VerbsStep() {
  const form = useFormContext<WizardForm>();
  const utils = trpc.useUtils();
  const presetsQ = trpc.verbPreset.list.useQuery();
  const userPresets = presetsQ.data ?? [];

  const verbs = useWatch({ control: form.control, name: "verbs" });
  const verbSet = useMemo(() => new Set(verbs), [verbs]);

  const [savePresetName, setSavePresetName] = useState("");
  const [activePresetKey, setActivePresetKey] = useState<string>(PRESET_NONE);

  const errors = form.formState.errors;

  function setVerbs(next: readonly Verb[]): void {
    // Preserve catalogue order.
    const ordered = VERB_CATALOG.filter((v) => next.includes(v));
    form.setValue("verbs", ordered, { shouldDirty: true, shouldValidate: true });
    setActivePresetKey(PRESET_NONE); // any manual edit clears preset selection
  }

  function toggleVerb(verb: Verb, checked: boolean): void {
    const next = new Set(verbSet);
    if (checked) next.add(verb);
    else next.delete(verb);
    setVerbs([...next] as Verb[]);
  }

  function setGroup(group: Group, action: "all" | "none"): void {
    const next = new Set(verbSet);
    if (action === "all") for (const v of group.verbs) next.add(v);
    if (action === "none") for (const v of group.verbs) next.delete(v);
    setVerbs([...next] as Verb[]);
  }

  function loadPreset(key: string): void {
    setActivePresetKey(key);
    if (key === PRESET_NONE) return;

    if (key in VERB_PRESETS) {
      const built = VERB_PRESETS[key as keyof typeof VERB_PRESETS];
      const ordered = VERB_CATALOG.filter((v) => built.includes(v));
      form.setValue("verbs", ordered, { shouldDirty: true, shouldValidate: true });
      return;
    }
    const userP = userPresets.find((p) => p.id === key);
    if (!userP) return;
    const ordered = VERB_CATALOG.filter((v) => userP.verbs.includes(v));
    form.setValue("verbs", ordered, { shouldDirty: true, shouldValidate: true });
  }

  const createPreset = trpc.verbPreset.create.useMutation({
    onSuccess: async (saved) => {
      toast.success(`Saved preset "${saved.name}"`);
      setSavePresetName("");
      setActivePresetKey(saved.id);
      await utils.verbPreset.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to save preset");
    },
  });

  function onSavePreset(): void {
    const name = savePresetName.trim();
    if (!name) return;
    if (verbs.length === 0) {
      toast.error("Pick at least one verb before saving");
      return;
    }
    createPreset.mutate({ name, verbs: [...verbs] });
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="sk-load-preset">Load preset</FieldLabel>
        <Select value={activePresetKey} onValueChange={loadPreset}>
          <SelectTrigger id="sk-load-preset">
            <SelectValue placeholder="Pick a preset…" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={PRESET_NONE}>Custom selection</SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Built-in</SelectLabel>
              {(Object.keys(VERB_PRESETS) as Array<keyof typeof VERB_PRESETS>).map((k) => (
                <SelectItem key={k} value={k}>
                  {BUILTIN_PRESET_LABEL[k]}
                </SelectItem>
              ))}
            </SelectGroup>
            {userPresets.length > 0 ? (
              <SelectGroup>
                <SelectLabel>Yours</SelectLabel>
                {userPresets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
          </SelectContent>
        </Select>
        <FieldDescription>
          Loading a preset replaces the current selection. {verbs.length} of {VERB_CATALOG.length}{" "}
          verbs selected.
        </FieldDescription>
      </Field>

      {VERB_GROUPS.map((g) => {
        const allOn = g.verbs.every((v) => verbSet.has(v));
        const someOn = g.verbs.some((v) => verbSet.has(v));
        return (
          <FieldSet key={g.key}>
            <div className="flex items-center justify-between">
              <FieldLegend variant="label">{g.title}</FieldLegend>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setGroup(g, allOn ? "none" : "all")}
                >
                  {allOn ? "Clear all" : someOn ? "Select all" : "Select all"}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {g.verbs.map((v) => {
                const id = `sk-verb-${v.replace(/[^\w-]/g, "_")}`;
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

      <FieldError>{errors.verbs?.message}</FieldError>

      <FieldSet>
        <FieldLegend variant="label">Save as preset</FieldLegend>
        <div className="flex gap-2">
          <Input
            placeholder="Preset name (e.g. Read+TaskWrite)"
            value={savePresetName}
            onChange={(e) => setSavePresetName(e.target.value)}
            maxLength={60}
          />
          <Button
            type="button"
            variant="outline"
            onClick={onSavePreset}
            disabled={
              createPreset.isPending || savePresetName.trim().length === 0 || verbs.length === 0
            }
          >
            <BookmarkPlusIcon data-icon="inline-start" />
            {createPreset.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
        <FieldDescription>
          Saves your current verb selection as a named preset. Manage existing presets on the{" "}
          Presets page.
        </FieldDescription>
      </FieldSet>
    </FieldGroup>
  );
}
