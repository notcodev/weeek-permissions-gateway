"use client";

import { useMemo } from "react";
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

function isWildcard(scope: readonly string[]): boolean {
  return scope.length === 1 && scope[0] === ALL;
}

export function BoardsStep({ workspaceId }: Props) {
  const form = useFormContext<WizardForm>();
  const scopeProjects = useWatch({ control: form.control, name: "scopeProjects" });
  const scopeBoards = useWatch({ control: form.control, name: "scopeBoards" });

  const projectsAll = isWildcard(scopeProjects);
  const boardsAll = isWildcard(scopeBoards);

  // When all projects selected we need the full project list to get their IDs.
  const projectsQ = trpc.weeekDirectory.projects.useQuery(
    { workspaceId },
    { enabled: projectsAll },
  );

  // Resolve which project IDs to fetch boards for.
  const projectIds: string[] = useMemo(() => {
    if (projectsAll) return (projectsQ.data ?? []).map((p) => String(p.id));
    return scopeProjects.filter((s) => s !== ALL);
  }, [projectsAll, projectsQ.data, scopeProjects]);

  const boardsQ = trpc.weeekDirectory.boardsForProjects.useQuery(
    { workspaceId, projectIds },
    { enabled: projectIds.length > 0 },
  );

  const boards = boardsQ.data ?? [];

  // Project name lookup for group headings.
  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projectsQ.data ?? []) map.set(String(p.id), p.name);
    return map;
  }, [projectsQ.data]);

  // Group boards by project when more than one project is involved.
  const grouped = useMemo(() => {
    if (projectIds.length <= 1) return null;
    const map = new Map<string, typeof boards>();
    for (const b of boards) {
      const pid = String(b.projectId);
      const arr = map.get(pid) ?? [];
      arr.push(b);
      map.set(pid, arr);
    }
    return map;
  }, [boards, projectIds.length]);

  function set(next: string[]): void {
    form.setValue("scopeBoards", next, { shouldDirty: true, shouldValidate: true });
  }

  function toggle(id: string, checked: boolean): void {
    if (checked) {
      const current = boardsAll ? [] : scopeBoards.filter((s) => s !== ALL);
      const next = [...current, id];
      const allIds = boards.map((b) => String(b.id));
      set(allIds.length > 0 && next.length === allIds.length ? [ALL] : next);
    } else {
      if (boardsAll) {
        set(boards.map((b) => String(b.id)).filter((x) => x !== id));
      } else {
        set(scopeBoards.filter((x) => x !== id));
      }
    }
  }

  const isLoading = boardsQ.isLoading || (projectsAll && projectsQ.isLoading);
  const errors = form.formState.errors;

  function renderGrid(list: typeof boards) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {list.map((b) => {
          const id = String(b.id);
          const inputId = `sk-board-${id}`;
          const checked = boardsAll || scopeBoards.includes(id);
          return (
            <FieldLabel key={id} htmlFor={inputId}>
              <Field orientation="horizontal">
                <Checkbox
                  id={inputId}
                  checked={checked}
                  onCheckedChange={(c) => toggle(id, c === true)}
                />
                <FieldTitle>{b.name}</FieldTitle>
              </Field>
            </FieldLabel>
          );
        })}
      </div>
    );
  }

  return (
    <FieldGroup>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Choose which boards this sub-key can access.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isLoading || boards.length === 0}
          onClick={() => set(boardsAll ? [] : [ALL])}
        >
          {boardsAll ? "Deselect all" : "Select all"}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : boardsQ.error ? (
        <p className="text-destructive text-sm">{boardsQ.error.message}</p>
      ) : boards.length === 0 ? (
        <p className="text-muted-foreground text-sm">No boards found.</p>
      ) : grouped ? (
        <div className="flex flex-col gap-4">
          {[...grouped.entries()].map(([pid, list]) => (
            <div key={pid} className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                {projectNameById.get(pid) ?? `Project ${pid}`}
              </p>
              {renderGrid(list)}
            </div>
          ))}
        </div>
      ) : (
        renderGrid(boards)
      )}

      <FieldError>{errors.scopeBoards?.message}</FieldError>
    </FieldGroup>
  );
}
