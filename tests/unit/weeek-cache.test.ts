import { describe, expect, test, vi } from "vitest";
import { getOrFetch, _resetCacheForTests } from "@/server/weeek/cache";

describe("getOrFetch", () => {
  test("calls loader once on miss, returns cached value on hit", async () => {
    _resetCacheForTests();
    const loader = vi.fn(async () => ({ value: 42 }));
    const a = await getOrFetch("k1", 60_000, loader);
    const b = await getOrFetch("k1", 60_000, loader);
    expect(a).toEqual({ value: 42 });
    expect(b).toEqual({ value: 42 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test("re-fetches after TTL expires", async () => {
    _resetCacheForTests();
    vi.useFakeTimers();
    const loader = vi.fn(async () => ({ n: Math.random() }));
    await getOrFetch("k2", 100, loader);
    vi.advanceTimersByTime(101);
    await getOrFetch("k2", 100, loader);
    expect(loader).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  test("loader rejection is not cached", async () => {
    _resetCacheForTests();
    let attempt = 0;
    const loader = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("boom");
      return { ok: true };
    });
    await expect(getOrFetch("k3", 60_000, loader)).rejects.toThrow("boom");
    const second = await getOrFetch("k3", 60_000, loader);
    expect(second).toEqual({ ok: true });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  test("different keys are isolated", async () => {
    _resetCacheForTests();
    const a = vi.fn(async () => "A");
    const b = vi.fn(async () => "B");
    expect(await getOrFetch("ka", 60_000, a)).toBe("A");
    expect(await getOrFetch("kb", 60_000, b)).toBe("B");
    expect(await getOrFetch("ka", 60_000, a)).toBe("A");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
