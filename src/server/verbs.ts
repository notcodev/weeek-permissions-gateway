export const VERB_CATALOG = [
  "projects:read",
  "projects:write",
  "projects:delete",
  "boards:read",
  "boards:write",
  "boards:delete",
  "tasks:read",
  "tasks:write",
  "tasks:delete",
  "tasks:complete",
  "tasks:move",
  "comments:read",
  "comments:write",
  "comments:delete",
  "members:read",
  "custom_fields:read",
  "custom_fields:write",
  "time_entries:read",
  "time_entries:write",
  "time_entries:delete",
] as const;

export type Verb = (typeof VERB_CATALOG)[number];

const VERB_SET: ReadonlySet<string> = new Set(VERB_CATALOG);

export function isVerb(s: string): s is Verb {
  return VERB_SET.has(s);
}

const READ_ONLY: readonly Verb[] = [
  "projects:read",
  "boards:read",
  "tasks:read",
  "comments:read",
  "members:read",
  "custom_fields:read",
  "time_entries:read",
];

const TASK_AUTOMATOR: readonly Verb[] = [
  "projects:read",
  "boards:read",
  "tasks:read",
  "tasks:write",
  "tasks:complete",
  "tasks:move",
  "comments:read",
  "comments:write",
  "members:read",
  "custom_fields:read",
  "time_entries:read",
  "time_entries:write",
];

const FULL_ACCESS: readonly Verb[] = VERB_CATALOG;

export const VERB_PRESETS = {
  "read-only": READ_ONLY,
  "task-automator": TASK_AUTOMATOR,
  "full-access": FULL_ACCESS,
} as const satisfies Record<string, readonly Verb[]>;

export type PresetKey = keyof typeof VERB_PRESETS;

export const PRESET_KEYS = [
  "read-only",
  "task-automator",
  "full-access",
] as const satisfies readonly PresetKey[];

export function expandPreset(key: PresetKey): readonly Verb[] {
  return VERB_PRESETS[key];
}

export function presetForVerbs(verbs: readonly string[]): PresetKey | null {
  const have = new Set(verbs);
  for (const key of PRESET_KEYS) {
    const expected = VERB_PRESETS[key];
    if (have.size === expected.length && expected.every((v) => have.has(v))) {
      return key;
    }
  }
  return null;
}
