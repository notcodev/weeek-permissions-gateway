"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { trpc } from "@/lib/trpc-client";
import type { WizardForm } from "./issue-sub-key-dialog";

type Props = {
  workspaceId: string;
};

const ALL = "*" as const;

export function ProjectsStep({ workspaceId }: Props) {
  const form = useFormContext<WizardForm>();
  const scopeProjects = useWatch({ control: form.control, name: "scopeProjects" });
  const projectsAll = scopeProjects.length === 1 && scopeProjects[0] === ALL;

  const projectsQ = trpc.weeekDirectory.projects.useQuery({ workspaceId });
  const projects = projectsQ.data ?? [];

  function set(next: string[]): void {
    form.setValue("scopeProjects", next, { shouldDirty: true, shouldValidate: true });
  }

  function toggle(id: string, checked: boolean): void {
    if (checked) {
      const current = projectsAll ? [] : scopeProjects.filter((s) => s !== ALL);
      const next = [...current, id];
      const allIds = projects.map((p) => String(p.id));
      // Auto-upgrade to wildcard when every item is explicitly selected.
      set(allIds.length > 0 && next.length === allIds.length ? [ALL] : next);
    } else {
      if (projectsAll) {
        // Deselect one item from "all" → explicit list minus this id.
        set(projects.map((p) => String(p.id)).filter((x) => x !== id));
      } else {
        set(scopeProjects.filter((x) => x !== id));
      }
    }
  }

  const errors = form.formState.errors;

  return (
    <FieldGroup>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Choose which projects this sub-key can access.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={projectsQ.isLoading || projects.length === 0}
          onClick={() => set(projectsAll ? [] : [ALL])}
        >
          {projectsAll ? "Deselect all" : "Select all"}
        </Button>
      </div>

      {projectsQ.isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : projectsQ.error ? (
        <p className="text-destructive text-sm">{projectsQ.error.message}</p>
      ) : projects.length === 0 ? (
        <p className="text-muted-foreground text-sm">No projects found.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {projects.map((p) => {
            const id = String(p.id);
            const inputId = `sk-project-${id}`;
            const checked = projectsAll || scopeProjects.includes(id);
            return (
              <FieldLabel key={id} htmlFor={inputId}>
                <Field orientation="horizontal">
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    onCheckedChange={(c) => toggle(id, c === true)}
                  />
                  <FieldTitle>{p.name}</FieldTitle>
                </Field>
              </FieldLabel>
            );
          })}
        </div>
      )}

      <FieldError>{errors.scopeProjects?.message}</FieldError>
    </FieldGroup>
  );
}
