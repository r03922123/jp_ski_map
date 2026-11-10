import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyRider,
  parseRider,
  RIDER_CORRUPT_KEY,
  RIDER_KEY,
  riderStore,
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
});

describe("riderStore", () => {
  beforeEach(() => {
    localStorage.clear();
    riderStore.reset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("persists changes and reads them back", () => {
    riderStore.update((s) => ({ ...s, name: "Yuki" }));
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

  it("storage that throws (private mode) still works for the session", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    riderStore.update((s) => ({ ...s, name: "Yuki" }));
    expect(riderStore.getSnapshot().name).toBe("Yuki");
  });

  it("another tab's change is picked up", () => {
    const seen = vi.fn();
    const off = riderStore.subscribe(seen);
    localStorage.setItem(
      RIDER_KEY,
      JSON.stringify({ ...emptyRider(), name: "Tab2" }),
    );
    window.dispatchEvent(new StorageEvent("storage", { key: RIDER_KEY }));
    expect(seen).toHaveBeenCalled();
    expect(riderStore.getSnapshot().name).toBe("Tab2");
    off();
  });
});
