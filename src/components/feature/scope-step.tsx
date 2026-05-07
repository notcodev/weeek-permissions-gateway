"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc-client";

type Props = {
  workspaceId: string;
  scopeProjects: readonly string[];
  scopeBoards: readonly string[];
  onChange: (next: { scopeProjects: string[]; scopeBoards: string[] }) => void;
};

const ALL = "*" as const;

function isWildcard(scope: readonly string[]): boolean {
  return scope.length === 1 && scope[0] === ALL;
}

export function ScopeStep({ workspaceId, scopeProjects, scopeBoards, onChange }: Props) {
  const [projectFilter, setProjectFilter] = useState("");
  const [boardFilter, setBoardFilter] = useState("");

  const projectsAll = isWildcard(scopeProjects);
  const boardsAll = isWildcard(scopeBoards);

  const projectsQ = trpc.weeekDirectory.projects.useQuery({ workspaceId });
  const selectedForBoards = projectsAll ? undefined : scopeProjects;
  const onlyOneProject = selectedForBoards && selectedForBoards.length === 1
    ? selectedForBoards[0]
    : undefined;
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

  function setProjectsAll(checked: boolean) {
    if (checked) {
      onChange({ scopeProjects: [ALL], scopeBoards: [...scopeBoards] });
    } else {
      onChange({ scopeProjects: [], scopeBoards: [...scopeBoards] });
    }
  }

  function toggleProject(id: string, checked: boolean) {
    const current = projectsAll ? [] : scopeProjects.filter((s) => s !== ALL);
    const next = checked ? [...current, id] : current.filter((x) => x !== id);
    onChange({ scopeProjects: next, scopeBoards: [...scopeBoards] });
  }

  function setBoardsAll(checked: boolean) {
    if (checked) {
      onChange({ scopeProjects: [...scopeProjects], scopeBoards: [ALL] });
    } else {
      onChange({ scopeProjects: [...scopeProjects], scopeBoards: [] });
    }
  }

  function toggleBoard(id: string, checked: boolean) {
    const current = boardsAll ? [] : scopeBoards.filter((s) => s !== ALL);
    const next = checked ? [...current, id] : current.filter((x) => x !== id);
    onChange({ scopeProjects: [...scopeProjects], scopeBoards: next });
  }

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        Limit which projects and boards this sub-key can touch. Default is everything.
      </p>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>Projects</Label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={projectsAll}
              onChange={(e) => setProjectsAll(e.target.checked)}
            />
            All projects
          </label>
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
              const checked = projectsAll || scopeProjects.includes(id);
              return (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-2 py-0.5 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={projectsAll}
                    onChange={(e) => toggleProject(id, e.target.checked)}
                  />
                  <span>{p.name}</span>
                </label>
              );
            })
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>Boards</Label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={boardsAll}
              onChange={(e) => setBoardsAll(e.target.checked)}
            />
            All boards
          </label>
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
              const checked = boardsAll || scopeBoards.includes(id);
              return (
                <label key={id} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={boardsAll}
                    onChange={(e) => toggleBoard(id, e.target.checked)}
                  />
                  <span>{b.name}</span>
                </label>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
