"use client";

import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
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
import type { WizardForm } from "./issue-sub-key-dialog";

type Props = {
  workspaceId: string;
};

function displayName(m: WeeekMemberRow): string {
  const composed = [m.firstName, m.lastName].filter(Boolean).join(" ").trim();
  return composed || m.email;
}

export function IdentityStep({ workspaceId }: Props) {
  const form = useFormContext<WizardForm>();
  const membersQ = trpc.weeekDirectory.members.useQuery({ workspaceId });
  const members = membersQ.data ?? [];

  const errors = form.formState.errors;
  const boundUserId = form.watch("boundWeeekUserId");
  const memberPicked = boundUserId !== null;

  const selectedMember = boundUserId
    ? (members.find((m) => String(m.id) === boundUserId) ?? null)
    : null;

  function setMember(m: WeeekMemberRow | null): void {
    if (!m) {
      form.setValue("boundWeeekUserId", null, { shouldDirty: true });
      form.setValue("boundWeeekUserName", null, { shouldDirty: true });
      form.setValue("visibilityBound", false, { shouldDirty: true });
      form.setValue("authorRewrite", false, { shouldDirty: true });
      return;
    }
    form.setValue("boundWeeekUserId", String(m.id), { shouldDirty: true });
    form.setValue("boundWeeekUserName", displayName(m), { shouldDirty: true });
  }

  return (
    <FieldGroup>
      <Field data-invalid={!!errors.label || undefined}>
        <FieldLabel htmlFor="sk-label">Label</FieldLabel>
        <Input
          id="sk-label"
          placeholder="CI bot"
          autoComplete="off"
          maxLength={80}
          aria-invalid={!!errors.label || undefined}
          {...form.register("label")}
        />
        <FieldDescription>
          Shown in the dashboard and in audit log; not embedded in the key itself.
        </FieldDescription>
        <FieldError>{errors.label?.message}</FieldError>
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
          <Controller
            control={form.control}
            name="visibilityBound"
            render={({ field }) => (
              <Checkbox
                id="sk-visibility-bound"
                checked={field.value}
                disabled={!memberPicked}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            )}
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
          <Controller
            control={form.control}
            name="authorRewrite"
            render={({ field }) => (
              <Checkbox
                id="sk-author-rewrite"
                checked={field.value}
                disabled={!memberPicked}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            )}
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
