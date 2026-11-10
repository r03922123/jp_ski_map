import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyRider,
  parseRider,
  RIDER_CORRUPT_KEY,
  RIDER_KEY,
  rename,
  riderStore,
  titleFor,
} from "@/lib/game/rider";

describe("rider state (SPEC-progression)", () => {
  it("starts as Rider with nothing yet", () => {
    expect(emptyRider()).toEqual({
      version: 1,
      name: "Rider",
      stamps: {},
      quests: [],
      stats: { km: { bus: 0, drive: 0, walk: 0 }, trips: 0 },
    });
  });

  it("renames: trimmed, at most 20 characters, blank goes back to Rider", () => {
    expect(rename(emptyRider(), "  Yuki  ").name).toBe("Yuki");
    expect(rename(emptyRider(), "a".repeat(30)).name).toHaveLength(20);
    expect(rename(emptyRider(), "   ").name).toBe("Rider");
  });

  it.each([
    [0, "Rookie"],
    [1, "First Tracks"],
    [2, "First Tracks"],
    [3, "Valley Rider"],
    [5, "Powder Hunter"],
    [7, "Powder Hunter"],
    [8, "Ridge Runner"],
    [9, "Ridge Runner"],
    [10, "Hakuba Legend"],
  ])("%i stamps of 10 worlds → %s", (n, title) => {
    expect(titleFor(n, 10)).toBe(title);
  });

  it("a Legend has every world, however many the catalog has", () => {
    expect(titleFor(11, 11)).toBe("Hakuba Legend");
    expect(titleFor(10, 11)).toBe("Ridge Runner");
  });

  it("parseRider accepts a valid state and rejects bad shapes", () => {
    const ok = {
      ...emptyRider(),
      stamps: {
        "happo-one": {
          resortId: "happo-one",
          firstAt: "2026-01-02",
          visits: ["2026-01-02"],
        },
      },
      quests: [
        {
          id: "powder:2026-01-02",
          date: "2026-01-02",
          status: "done",
          doneAt: "2026-01-02",
        },
      ],
    };
    expect(parseRider(ok)).toEqual(ok);
    expect(parseRider({ ...ok, version: 2 })).toBeNull();
    expect(parseRider({ ...ok, version: "1" })).toBeNull();
    expect(parseRider({ ...ok, name: 3 })).toBeNull();
    expect(
      parseRider({
        ...ok,
        stamps: { x: { resortId: "x", firstAt: "yesterday", visits: [] } },
      }),
    ).toBeNull();
    expect(
      parseRider({
        ...ok,
        stats: { km: { bus: -1, drive: 0, walk: 0 }, trips: 0 },
      }),
    ).toBeNull();
    expect(
      parseRider({
        ...ok,
        quests: [{ id: "q", date: "2026-01-02", status: "won" }],
      }),
    ).toBeNull();
  });

  describe("migration: older saves are converted, never dropped", () => {
    const stamp = {
      resortId: "happo-one",
      firstAt: "2026-01-02",
      visits: ["2026-01-02", "2026-01-03"],
    };
    // An older shape, one version behind the current one, with one field the
    // current shape no longer has and one it lacks.
    const old = {
      version: emptyRider().version - 1,
      name: "Yuki",
      stamps: { "happo-one": stamp },
      legacy: "gone in the current shape",
      stats: { km: { bus: 3, drive: 0, walk: 1 }, trips: 2 },
    };
    const steps = {
      [old.version]: ({ legacy: _, ...s }: Record<string, unknown>) => ({
        ...s,
        version: emptyRider().version,
        quests: [],
      }),
    };

    it("an older save loads as the current version with stamps intact", () => {
      expect(parseRider(old, steps)).toEqual({
        version: emptyRider().version,
        name: "Yuki",
        stamps: { "happo-one": stamp },
        quests: [],
        stats: { km: { bus: 3, drive: 0, walk: 1 }, trips: 2 },
      });
    });

    it("a version with no migration step, or a step whose output is invalid, is rejected", () => {
      expect(parseRider(old, {})).toBeNull();
      expect(
        parseRider(old, { [old.version]: () => ({ version: 99 }) }),
      ).toBeNull();
    });
  });
});

describe("riderStore", () => {
  beforeEach(() => {
    localStorage.clear();
    riderStore.reset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("persists changes and reads them back", () => {
    riderStore.update((s) => rename(s, "Yuki"));
    riderStore.reset();
    expect(riderStore.getSnapshot().name).toBe("Yuki");
    expect(JSON.parse(localStorage.getItem(RIDER_KEY) ?? "{}").name).toBe(
      "Yuki",
    );
  });

  it("corrupt storage → empty progress, raw value kept aside", () => {
    localStorage.setItem(RIDER_KEY, "{not json");
    expect(riderStore.getSnapshot()).toEqual(emptyRider());
    expect(localStorage.getItem(RIDER_CORRUPT_KEY)).toBe("{not json");
  });

  it("a save too old to migrate → empty progress, raw value kept aside", () => {
    const raw = JSON.stringify({ ...emptyRider(), version: 0 });
    localStorage.setItem(RIDER_KEY, raw);
    expect(riderStore.getSnapshot()).toEqual(emptyRider());
    expect(localStorage.getItem(RIDER_CORRUPT_KEY)).toBe(raw);
  });

  it("storage that throws (private mode) still works for the session", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    riderStore.update((s) => rename(s, "Yuki"));
    expect(riderStore.getSnapshot().name).toBe("Yuki");
  });

  it("another tab's change is picked up", () => {
    const seen = vi.fn();
    const off = riderStore.subscribe(seen);
    localStorage.setItem(
      RIDER_KEY,
      JSON.stringify(rename(emptyRider(), "Tab2")),
    );
    window.dispatchEvent(new StorageEvent("storage", { key: RIDER_KEY }));
    expect(seen).toHaveBeenCalled();
    expect(riderStore.getSnapshot().name).toBe("Tab2");
    off();
  });
});
