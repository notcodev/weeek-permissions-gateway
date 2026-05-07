import { describe, expect, test } from "vitest";

describe("verbs", () => {
  test("VERB_CATALOG matches the Weeek public API surface (comments dropped — not exposed)", async () => {
    const { VERB_CATALOG } = await import("@/server/verbs");
    expect([...VERB_CATALOG].sort()).toEqual(
      [
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
        "members:read",
        "custom_fields:read",
        "custom_fields:write",
        "time_entries:read",
        "time_entries:write",
        "time_entries:delete",
      ].sort(),
    );
  });

  test("isVerb narrows to a known verb", async () => {
    const { isVerb } = await import("@/server/verbs");
    expect(isVerb("tasks:read")).toBe(true);
    expect(isVerb("tasks:nuke")).toBe(false);
    expect(isVerb("")).toBe(false);
  });

  test("PRESET_KEYS exposes exactly the three v0 presets", async () => {
    const { PRESET_KEYS } = await import("@/server/verbs");
    expect([...PRESET_KEYS].sort()).toEqual(["full-access", "read-only", "task-automator"]);
  });

  test("read-only preset includes only :read verbs", async () => {
    const { VERB_PRESETS } = await import("@/server/verbs");
    const verbs = VERB_PRESETS["read-only"];
    expect(verbs.length).toBeGreaterThan(0);
    for (const v of verbs) {
      expect(v.endsWith(":read")).toBe(true);
    }
  });

  test("task-automator preset includes tasks:write but no tasks:delete; can complete + move", async () => {
    const { VERB_PRESETS } = await import("@/server/verbs");
    const verbs = new Set(VERB_PRESETS["task-automator"]);
    expect(verbs.has("tasks:write")).toBe(true);
    expect(verbs.has("tasks:delete")).toBe(false);
    expect(verbs.has("tasks:complete")).toBe(true);
    expect(verbs.has("tasks:move")).toBe(true);
  });

  test("full-access preset equals the catalogue", async () => {
    const { VERB_CATALOG, VERB_PRESETS } = await import("@/server/verbs");
    expect([...VERB_PRESETS["full-access"]].sort()).toEqual([...VERB_CATALOG].sort());
  });

  test("expandPreset returns the preset's verbs", async () => {
    const { expandPreset, VERB_PRESETS } = await import("@/server/verbs");
    expect(expandPreset("read-only")).toEqual(VERB_PRESETS["read-only"]);
    expect(expandPreset("full-access")).toEqual(VERB_PRESETS["full-access"]);
  });

  test("presetForVerbs identifies a preset from its expanded verb set", async () => {
    const { presetForVerbs, VERB_PRESETS } = await import("@/server/verbs");
    expect(presetForVerbs([...VERB_PRESETS["read-only"]])).toBe("read-only");
    expect(presetForVerbs([...VERB_PRESETS["task-automator"]])).toBe("task-automator");
    expect(presetForVerbs([...VERB_PRESETS["full-access"]])).toBe("full-access");
  });

  test("presetForVerbs returns null for a custom verb set", async () => {
    const { presetForVerbs } = await import("@/server/verbs");
    expect(presetForVerbs(["tasks:read"])).toBeNull();
    expect(presetForVerbs([])).toBeNull();
  });
});
