"use client";

import { useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Input } from "@/components/ui/input";
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
import { trpc } from "@/lib/trpc-client";
import type { WizardForm } from "./issue-sub-key-dialog";

type Props = {
  workspaceId: string;
};

const ALL = "*" as const;

function isWildcard(scope: readonly string[]): boolean {
  return scope.length === 1 && scope[0] === ALL;
}

export function ScopeStep({ workspaceId }: Props) {
  const form = useFormContext<WizardForm>();
  const [projectFilter, setProjectFilter] = useState("");
  const [boardFilter, setBoardFilter] = useState("");

  const scopeProjects = useWatch({ control: form.control, name: "scopeProjects" });
  const scopeBoards = useWatch({ control: form.control, name: "scopeBoards" });

  const projectsAll = isWildcard(scopeProjects);
  const boardsAll = isWildcard(scopeBoards);

  const projectsQ = trpc.weeekDirectory.projects.useQuery({ workspaceId });
  const selectedForBoards = projectsAll ? undefined : scopeProjects;
  const onlyOneProject =
    selectedForBoards && selectedForBoards.length === 1 ? selectedForBoards[0] : undefined;
  const boardsQ = trpc.weeekDirectory.boards.useQuery(
    {
      workspaceId,
      ...(onlyOneProject ? { projectId: onlyOneProject } : {}),
    },
    { enabled: projectsAll || (selectedForBoards?.length ?? 0) >= 1 },
  );

  const projects = projectsQ.data;
  const boards = boardsQ.data;

  const filteredProjects = useMemo(() => {
    const list = projects ?? [];
    const f = projectFilter.trim().toLowerCase();
    if (!f) return list;
    return list.filter((p) => p.name.toLowerCase().includes(f));
  }, [projects, projectFilter]);

  const filteredBoards = useMemo(() => {
    const list = boards ?? [];
    const f = boardFilter.trim().toLowerCase();
    if (!f) return list;
    return list.filter((b) => b.name.toLowerCase().includes(f));
  }, [boards, boardFilter]);

  function setProjects(next: string[]): void {
    form.setValue("scopeProjects", next, { shouldDirty: true, shouldValidate: true });
  }
  function setBoards(next: string[]): void {
    form.setValue("scopeBoards", next, { shouldDirty: true, shouldValidate: true });
  }

  function setProjectsAll(checked: boolean): void {
    setProjects(checked ? [ALL] : []);
  }

  function toggleProject(id: string, checked: boolean): void {
    const current = projectsAll ? [] : scopeProjects.filter((s) => s !== ALL);
    setProjects(checked ? [...current, id] : current.filter((x) => x !== id));
  }

  function setBoardsAll(checked: boolean): void {
    setBoards(checked ? [ALL] : []);
  }

  function toggleBoard(id: string, checked: boolean): void {
    const current = boardsAll ? [] : scopeBoards.filter((s) => s !== ALL);
    setBoards(checked ? [...current, id] : current.filter((x) => x !== id));
  }

  const errors = form.formState.errors;

  return (
    <FieldGroup>
      <FieldDescription>
        Limit which projects and boards this sub-key can touch. Default is everything.
      </FieldDescription>

      <FieldSet data-invalid={!!errors.scopeProjects || undefined}>
        <div className="flex items-center justify-between">
          <FieldLegend variant="label">Projects</FieldLegend>
          <Field orientation="horizontal" className="w-auto">
            <Checkbox
              id="sk-projects-all"
              checked={projectsAll}
              onCheckedChange={(checked) => setProjectsAll(checked === true)}
            />
            <FieldLabel htmlFor="sk-projects-all" className="font-normal">
              All projects
            </FieldLabel>
          </Field>
        </div>
        <Input
          placeholder="Filter projects…"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          disabled={projectsAll}
        />
        <div className="max-h-32 overflow-auto rounded-md border p-2">
          {projectsQ.isLoading ? (
            <p className="text-muted-foreground text-xs">Loading…</p>
          ) : projectsQ.error ? (
            <p className="text-destructive text-xs">{projectsQ.error.message}</p>
          ) : filteredProjects.length === 0 ? (
            <p className="text-muted-foreground text-xs">No projects.</p>
          ) : (
            filteredProjects.map((p) => {
              const id = String(p.id);
              const inputId = `sk-project-${id}`;
              const checked = projectsAll || scopeProjects.includes(id);
              return (
                <Field key={id} orientation="horizontal" className="py-0.5">
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    disabled={projectsAll}
                    onCheckedChange={(c) => toggleProject(id, c === true)}
                  />
                  <FieldLabel htmlFor={inputId} className="font-normal">
                    {p.name}
                  </FieldLabel>
                </Field>
              );
            })
          )}
        </div>
        <FieldError>{errors.scopeProjects?.message}</FieldError>
      </FieldSet>

      <FieldSet data-invalid={!!errors.scopeBoards || undefined}>
        <div className="flex items-center justify-between">
          <FieldLegend variant="label">Boards</FieldLegend>
          <Field orientation="horizontal" className="w-auto">
            <Checkbox
              id="sk-boards-all"
              checked={boardsAll}
              onCheckedChange={(checked) => setBoardsAll(checked === true)}
            />
            <FieldLabel htmlFor="sk-boards-all" className="font-normal">
              All boards
            </FieldLabel>
          </Field>
        </div>
        <Input
          placeholder="Filter boards…"
          value={boardFilter}
          onChange={(e) => setBoardFilter(e.target.value)}
          disabled={boardsAll}
        />
        <div className="max-h-32 overflow-auto rounded-md border p-2">
          {!projectsAll && scopeProjects.length === 0 ? (
            <p className="text-muted-foreground text-xs">Pick a project to load boards.</p>
          ) : boardsQ.isLoading ? (
            <p className="text-muted-foreground text-xs">Loading…</p>
          ) : boardsQ.error ? (
            <p className="text-destructive text-xs">{boardsQ.error.message}</p>
          ) : filteredBoards.length === 0 ? (
            <p className="text-muted-foreground text-xs">No boards.</p>
          ) : (
            filteredBoards.map((b) => {
              const id = String(b.id);
              const inputId = `sk-board-${id}`;
              const checked = boardsAll || scopeBoards.includes(id);
              return (
                <Field key={id} orientation="horizontal" className="py-0.5">
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    disabled={boardsAll}
                    onCheckedChange={(c) => toggleBoard(id, c === true)}
                  />
                  <FieldLabel htmlFor={inputId} className="font-normal">
                    {b.name}
                  </FieldLabel>
                </Field>
              );
            })
          )}
        </div>
        <FieldError>{errors.scopeBoards?.message}</FieldError>
      </FieldSet>
    </FieldGroup>
  );
}
