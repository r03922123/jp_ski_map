import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addList,
  CORRUPT_KEY,
  deleteList,
  emptyState,
  isSaved,
  MAX_LISTS,
  MAX_PLACES,
  type PlaceInput,
  parseState,
  placeAt,
  removePlace,
  SAVED_KEY,
  savedStore,
  setHotel,
  setListHidden,
  setNote,
  toggleInList,
  visibleMarkers,
} from "@/lib/saved-places";

const hotel: PlaceInput = {
  id: "osm-node-1",
  name: "Hotel Hakuba",
  coord: { lat: 36.69812, lng: 137.86123 },
  kind: "lodging",
};
const ramen: PlaceInput = {
  id: "osm-node-2",
  name: "Ramen Shop",
  coord: { lat: 36.7, lng: 137.85 },
  kind: "poi",
};

describe("saved lists (pure)", () => {
  it("starts with the three built-in lists and no places", () => {
    const s = emptyState();
    expect(s.lists.map((l) => l.id)).toEqual([
      "starred",
      "favorites",
      "want-to-go",
    ]);
    expect(s.places).toEqual([]);
  });

  it("adds a place to a list and removes it again", () => {
    const added = toggleInList(emptyState(), hotel, "starred");
    expect(added.places).toHaveLength(1);
    expect(added.places[0].lists).toEqual(["starred"]);
    expect(isSaved(added, hotel.id)).toBe(true);

    const removed = toggleInList(added, hotel, "starred");
    expect(removed.places).toEqual([]);
    expect(isSaved(removed, hotel.id)).toBe(false);
  });

  it("keeps one place in several lists", () => {
    let s = toggleInList(emptyState(), hotel, "starred");
    s = toggleInList(s, hotel, "favorites");
    expect(s.places).toHaveLength(1);
    expect(s.places[0].lists).toEqual(["starred", "favorites"]);
  });

  it("allows at most one hotel label, and the label alone keeps a place saved", () => {
    let s = setHotel(emptyState(), hotel);
    s = setHotel(s, ramen);
    expect(
      s.places.filter((p) => p.label === "hotel").map((p) => p.id),
    ).toEqual([ramen.id]);
    expect(isSaved(s, hotel.id)).toBe(false); // lost its only reason to be saved
    expect(setHotel(s, null).places).toEqual([]);
  });

  it("can't delete a built-in list; deleting a custom list drops its places", () => {
    expect(deleteList(emptyState(), "starred").lists).toHaveLength(3);
    const created = addList(emptyState(), "Onsen", "bookmark");
    if (!created) throw new Error("list not created");
    const withPlace = toggleInList(created.state, ramen, created.id);
    const after = deleteList(withPlace, created.id);
    expect(after.lists).toHaveLength(3);
    expect(after.places).toEqual([]);
  });

  it("enforces the list and place limits", () => {
    let s = emptyState();
    for (let i = s.lists.length; i < MAX_LISTS; i++) {
      const r = addList(s, `L${i}`, "flag");
      if (!r) throw new Error("hit the limit early");
      s = r.state;
    }
    expect(addList(s, "one too many", "flag")).toBeNull();

    let p = emptyState();
    for (let i = 0; i < MAX_PLACES; i++) {
      p = toggleInList(p, { ...hotel, id: `p${i}` }, "starred");
    }
    expect(toggleInList(p, ramen, "starred").places).toHaveLength(MAX_PLACES);
  });

  it("trims notes to 140 characters, hides lists, removes places", () => {
    let s = toggleInList(emptyState(), hotel, "starred");
    s = setNote(s, hotel.id, `  ${"x".repeat(200)}  `);
    expect(s.places[0].note).toHaveLength(140);
    s = setListHidden(s, "starred", true);
    expect(s.lists.find((l) => l.id === "starred")?.hidden).toBe(true);
    expect(removePlace(s, hotel.id).places).toEqual([]);
  });
});

describe("parseState", () => {
  it("accepts a valid state and rejects bad shapes", () => {
    const good = toggleInList(emptyState(), hotel, "starred");
    expect(parseState(JSON.parse(JSON.stringify(good)))).toEqual(good);
    expect(parseState({ version: 2, lists: [], places: [] })).toBeNull();
    expect(parseState({ version: 1, lists: "x", places: [] })).toBeNull();
    const nanCoord = {
      ...good,
      places: [{ ...good.places[0], coord: { lat: "36", lng: 137 } }],
    };
    expect(parseState(nanCoord)).toBeNull();
  });

  it("restores built-in lists a stored state is missing", () => {
    const s = parseState({ version: 1, lists: [], places: [] });
    expect(s?.lists.map((l) => l.id)).toEqual([
      "starred",
      "favorites",
      "want-to-go",
    ]);
  });
});

describe("savedStore (localStorage)", () => {
  beforeEach(() => {
    localStorage.clear();
    savedStore.reset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("persists updates and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = savedStore.subscribe(listener);
    savedStore.update((s) => toggleInList(s, hotel, "starred"));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(localStorage.getItem(SAVED_KEY) ?? "{}").places,
    ).toHaveLength(1);
    unsubscribe();
  });

  it("returns the same snapshot object until something changes", () => {
    expect(savedStore.getSnapshot()).toBe(savedStore.getSnapshot());
  });

  it("starts empty from a corrupt value and keeps it aside", () => {
    localStorage.setItem(SAVED_KEY, "{not json");
    savedStore.reset();
    expect(savedStore.getSnapshot().places).toEqual([]);
    expect(localStorage.getItem(CORRUPT_KEY)).toBe("{not json");
  });

  it("falls back to memory when storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    savedStore.update((s) => toggleInList(s, hotel, "starred"));
    expect(isSaved(savedStore.getSnapshot(), hotel.id)).toBe(true);
  });

  it("picks up changes made in another tab", () => {
    const listener = vi.fn();
    const unsubscribe = savedStore.subscribe(listener);
    const other = toggleInList(emptyState(), ramen, "favorites");
    localStorage.setItem(SAVED_KEY, JSON.stringify(other));
    window.dispatchEvent(new StorageEvent("storage", { key: SAVED_KEY }));
    expect(listener).toHaveBeenCalled();
    expect(isSaved(savedStore.getSnapshot(), ramen.id)).toBe(true);
    unsubscribe();
  });
});

describe("visibleMarkers", () => {
  it("draws My hotel and places in visible lists only", () => {
    let s = setHotel(emptyState(), hotel);
    s = toggleInList(s, ramen, "favorites");
    expect(visibleMarkers(s).map((m) => [m.id, m.icon])).toEqual([
      [hotel.id, "hotel"],
      [ramen.id, "heart"],
    ]);
    s = setListHidden(s, "favorites", true);
    expect(visibleMarkers(s).map((m) => m.id)).toEqual([hotel.id]);
  });
});

describe("placeAt", () => {
  it("finds a saved place by coordinate to about a metre", () => {
    const s = toggleInList(emptyState(), hotel, "starred");
    expect(placeAt(s, { lat: 36.698121, lng: 137.861229 })?.id).toBe(hotel.id);
    expect(placeAt(s, { lat: 36.6982, lng: 137.86123 })).toBeUndefined();
  });
});
