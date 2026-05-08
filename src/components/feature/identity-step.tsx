"use client";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { trpc } from "@/lib/trpc-client";
import type { WeeekMemberRow } from "@/server/weeek/directory";

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

function displayName(m: WeeekMemberRow): string {
  const composed = [m.firstName, m.lastName].filter(Boolean).join(" ").trim();
  return composed || m.email;
}

export function IdentityStep({ workspaceId, state, onChange }: Props) {
  const membersQ = trpc.weeekDirectory.members.useQuery({ workspaceId });
  const members = membersQ.data ?? [];

  const selectedMember = state.boundWeeekUserId
    ? (members.find((m) => String(m.id) === state.boundWeeekUserId) ?? null)
    : null;

  function setMember(m: WeeekMemberRow | null) {
    if (!m) {
      onChange({
        ...state,
        boundWeeekUserId: null,
        boundWeeekUserName: null,
        visibilityBound: false,
        authorRewrite: false,
      });
      return;
    }
    onChange({
      ...state,
      boundWeeekUserId: String(m.id),
      boundWeeekUserName: displayName(m),
    });
  }

  const memberPicked = state.boundWeeekUserId !== null;

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="sk-label">Label</FieldLabel>
        <Input
          id="sk-label"
          value={state.label}
          onChange={(e) => onChange({ ...state, label: e.target.value })}
          placeholder="CI bot"
          autoComplete="off"
          maxLength={80}
          required
        />
        <FieldDescription>
          Shown in the dashboard and in audit log; not embedded in the key itself.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="sk-member">Bound Weeek user (optional)</FieldLabel>
        <Combobox
          items={members}
          value={selectedMember}
          onValueChange={(m) => setMember((m as WeeekMemberRow | null) ?? null)}
          itemToStringValue={(m: WeeekMemberRow) => String(m.id)}
          itemToStringLabel={(m: WeeekMemberRow) => `${displayName(m)} (${m.email})`}
        >
          <ComboboxInput
            id="sk-member"
            placeholder={membersQ.isLoading ? "Loading…" : "Search members…"}
            disabled={membersQ.isLoading}
            showClear={selectedMember !== null}
          />
          <ComboboxContent>
            <ComboboxEmpty>No matching members.</ComboboxEmpty>
            <ComboboxList>
              <ComboboxCollection>
                {(m: WeeekMemberRow) => (
                  <ComboboxItem key={String(m.id)} value={m}>
                    <span>{displayName(m)}</span>
                    <span className="text-muted-foreground"> ({m.email})</span>
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        {membersQ.error ? (
          <FieldDescription className="text-destructive">
            {membersQ.error.message}
          </FieldDescription>
        ) : null}
      </Field>

      <FieldLabel htmlFor="sk-visibility-bound">
        <Field orientation="horizontal" data-disabled={!memberPicked || undefined}>
          <Checkbox
            id="sk-visibility-bound"
            checked={state.visibilityBound}
            disabled={!memberPicked}
            onCheckedChange={(checked) =>
              onChange({ ...state, visibilityBound: checked === true })
            }
          />
          <FieldContent>
            <FieldTitle>Filter visibility to this user</FieldTitle>
            <FieldDescription>
              On the task list endpoint the proxy injects a{" "}
              <code className="px-1">userId</code> filter so this sub-key only sees the bound
              user&apos;s items.
            </FieldDescription>
          </FieldContent>
        </Field>
      </FieldLabel>

      <FieldLabel htmlFor="sk-author-rewrite">
        <Field orientation="horizontal" data-disabled={!memberPicked || undefined}>
          <Checkbox
            id="sk-author-rewrite"
            checked={state.authorRewrite}
            disabled={!memberPicked}
            onCheckedChange={(checked) =>
              onChange({ ...state, authorRewrite: checked === true })
            }
          />
          <FieldContent>
            <FieldTitle>Use as default author</FieldTitle>
            <FieldDescription>
              On task creates and updates, if the request body omits the{" "}
              <code className="px-1">userId</code> field, the proxy inserts the bound user&apos;s
              id.
            </FieldDescription>
          </FieldContent>
        </Field>
      </FieldLabel>
    </FieldGroup>
  );
}
