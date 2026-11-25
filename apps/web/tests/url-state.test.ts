import { describe, expect, it } from "vitest";
import {
  DEFAULT_RANK,
  parseViewState,
  serializeViewState,
  type ViewState,
} from "@/lib/url-state";

describe("parseViewState", () => {
  it("reads origin, mode and resort", () => {
    expect(
      parseViewState("?from=36.69,137.87&mode=walk&resort=happo-one"),
    ).toEqual({
      origin: { lat: 36.69, lng: 137.87 },
      mode: "walk",
      resortId: "happo-one",
      poiId: null,
      category: "resorts",
      rank: DEFAULT_RANK,
      point: null,
      stops: [],
    });
  });

  it("falls back to defaults for missing or invalid values", () => {
    expect(parseViewState("?from=abc&mode=fly")).toEqual({
      origin: null,
      mode: "walk",
      resortId: null,
      poiId: null,
      category: "resorts",
      rank: DEFAULT_RANK,
      point: null,
      stops: [],
    });
  });

  it("opens an old ?mode=drive link on Walk, since the Drive mode is gone", () => {
    expect(parseViewState("?mode=drive").mode).toBe("walk");
  });

  it("rejects out-of-range coordinates", () => {
    expect(parseViewState("?from=95,137.8").origin).toBeNull();
  });
});

describe("serializeViewState", () => {
  it("rounds coordinates to 5 decimals (~1 m) and omits empty values", () => {
    expect(
      serializeViewState({
        origin: { lat: 36.6912345678, lng: 137.8712345678 },
        mode: "walk",
        resortId: null,
        poiId: null,
        category: "resorts",
        rank: DEFAULT_RANK,
        point: null,
        stops: [],
      }),
    ).toBe("?from=36.69123%2C137.87123&mode=walk");
  });

  it("round-trips through parse", () => {
    const state: ViewState = {
      origin: { lat: 36.69, lng: 137.87 },
      mode: "walk" as const,
      resortId: "cortina",
      poiId: null,
      category: "resorts",
      rank: DEFAULT_RANK,
      point: null,
      stops: [],
    };

    expect(parseViewState(serializeViewState(state))).toEqual(state);
  });
});

describe("rank options in the URL", () => {
  it("round-trips sort and filters", () => {
    const state: ViewState = {
      origin: { lat: 36.69, lng: 137.87 },
      mode: "walk" as const,
      resortId: null,
      poiId: null,
      category: "resorts",
      rank: {
        sort: "terrain_size" as const,
        maxWalkMin: 20,
        nightSkiing: true,
        hvPass: false,
      },
      point: null,
      stops: [],
    };

    expect(parseViewState(serializeViewState(state))).toEqual(state);
  });

  it("defaults to walk time and no filters", () => {
    expect(parseViewState("?sort=best&maxWalk=-3").rank).toEqual({
      sort: "walk_time",
      maxWalkMin: null,
      nightSkiing: false,
      hvPass: false,
    });
  });

  it("drops the date of an old ?date= link: the panel has no Date to clear it", () => {
    const view = parseViewState("?mode=walk&date=2026-02-21");
    expect(view.rank).toEqual(DEFAULT_RANK);
    expect(serializeViewState(view)).not.toContain("date");
  });

  // the panel tidy (2026-11-25) keeps two sorts; a link with another one opens on the default
  it.each([
    "fresh_snow",
    "snow_depth",
    "crowd",
    "vertical",
  ])("opens an old ?sort=%s link on walk time", (sort) => {
    expect(parseViewState(`?sort=${sort}`).rank.sort).toBe("walk_time");
  });

  it("opens an old ?sort=price link on walk time, since price is hidden", () => {
    // price is left out of SORT_KEYS until every resort has a comparable
    // 2026–27 price; putting it back makes this parse return "price"
    expect(parseViewState("?sort=price").rank.sort).toBe("walk_time");
  });
});

describe("place destinations", () => {
  it("reads a place destination and its category", () => {
    const view = parseViewState(
      "?from=36.69,137.87&mode=walk&cat=convenience&dest=poi%3Aosm%3Anode%2F123",
    );

    expect(view.category).toBe("convenience");
    expect(view.poiId).toBe("osm:node/123");
    expect(view.resortId).toBeNull();
  });

  it("reads dest=resort:… as a resort and ignores unknown categories", () => {
    const view = parseViewState("?dest=resort%3Ahappo-one&cat=onsen");

    expect(view.resortId).toBe("happo-one");
    expect(view.category).toBe("resorts");
  });

  it("round-trips a place destination", () => {
    const search = serializeViewState({
      origin: { lat: 36.69, lng: 137.87 },
      mode: "walk",
      resortId: null,
      poiId: "osm:node/123",
      category: "food",
      rank: DEFAULT_RANK,
      point: null,
      stops: [],
    });

    expect(search).toContain("cat=food");
    expect(parseViewState(search).poiId).toBe("osm:node/123");
    expect(search).not.toContain("resort=");
  });
});

describe("point destinations (saved places: Go here)", () => {
  it("reads dest=pt:lat,lng and round-trips it", () => {
    const view = parseViewState(
      "?from=36.69,137.87&mode=walk&dest=pt%3A36.70001%2C137.85002",
    );
    expect(view.point).toEqual({ lat: 36.70001, lng: 137.85002 });
    expect(view.poiId).toBeNull();
    expect(view.resortId).toBeNull();

    const search = serializeViewState({ ...view, point: view.point });
    expect(search).toContain("dest=pt%3A36.70001%2C137.85002");
    expect(parseViewState(search).point).toEqual(view.point);
  });

  it("ignores a malformed point", () => {
    expect(parseViewState("?dest=pt%3Anope").point).toBeNull();
  });
});
