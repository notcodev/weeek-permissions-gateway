"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc-client";

export type IdentityState = {
  label: string;
  boundWeeekUserId: string | null;
  boundWeeekUserName: string | null;
  visibilityBound: boolean;
  authorRewrite: boolean;
};

type Props = {
  workspaceId: string;
  state: IdentityState;
  onChange: (next: IdentityState) => void;
};

export function IdentityStep({ workspaceId, state, onChange }: Props) {
  const membersQ = trpc.weeekDirectory.members.useQuery({ workspaceId });
  const members = membersQ.data ?? [];

  function setMember(id: string) {
    if (id === "") {
      onChange({
        ...state,
        boundWeeekUserId: null,
        boundWeeekUserName: null,
        visibilityBound: false,
        authorRewrite: false,
      });
      return;
    }
    const m = members.find((x) => String(x.id) === id);
    onChange({
      ...state,
      boundWeeekUserId: id,
      boundWeeekUserName: m?.name ?? null,
    });
  }

  const memberPicked = state.boundWeeekUserId !== null;

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="sk-label">Label</Label>
        <Input
          id="sk-label"
          value={state.label}
          onChange={(e) => onChange({ ...state, label: e.target.value })}
          placeholder="CI bot"
          autoComplete="off"
          maxLength={80}
          required
        />
        <p className="text-muted-foreground text-xs">
          Shown in the dashboard and in audit log; not embedded in the key itself.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="sk-member">Bound Weeek user (optional)</Label>
        <select
          id="sk-member"
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          value={state.boundWeeekUserId ?? ""}
          onChange={(e) => setMember(e.target.value)}
          disabled={membersQ.isLoading}
        >
          <option value="">— None —</option>
          {members.map((m) => (
            <option key={String(m.id)} value={String(m.id)}>
              {m.name}
            </option>
          ))}
        </select>
        {membersQ.error ? (
          <p className="text-destructive text-xs">{membersQ.error.message}</p>
        ) : null}
      </div>

      <label
        className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 ${
          memberPicked ? "" : "opacity-50"
        }`}
      >
        <input
          type="checkbox"
          className="mt-0.5"
          checked={state.visibilityBound}
          disabled={!memberPicked}
          onChange={(e) => onChange({ ...state, visibilityBound: e.target.checked })}
        />
        <span className="text-sm">
          <span className="font-medium">Filter visibility to this user.</span>{" "}
          <span className="text-muted-foreground">
            On list endpoints (tasks, comments, time entries) the proxy injects an{" "}
            <code className="px-1">assigneeId</code> filter so this sub-key only sees the bound
            user&apos;s items.
          </span>
        </span>
      </label>

      <label
        className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 ${
          memberPicked ? "" : "opacity-50"
        }`}
      >
        <input
          type="checkbox"
          className="mt-0.5"
          checked={state.authorRewrite}
          disabled={!memberPicked}
          onChange={(e) => onChange({ ...state, authorRewrite: e.target.checked })}
        />
        <span className="text-sm">
          <span className="font-medium">Use as default author.</span>{" "}
          <span className="text-muted-foreground">
            On task and comment writes, if the request body omits the author field, the proxy
            inserts the bound user&apos;s id.
          </span>
        </span>
      </label>
    </div>
  );
}
