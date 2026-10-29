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
    });
  });

  it("falls back to defaults for missing or invalid values", () => {
    expect(parseViewState("?from=abc&mode=fly")).toEqual({
      origin: null,
      mode: "drive",
      resortId: null,
      poiId: null,
      category: "resorts",
      rank: DEFAULT_RANK,
    });
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
        mode: "drive",
        resortId: null,
        poiId: null,
        category: "resorts",
        rank: DEFAULT_RANK,
      }),
    ).toBe("?from=36.69123%2C137.87123&mode=drive");
  });

  it("round-trips through parse", () => {
    const state: ViewState = {
      origin: { lat: 36.69, lng: 137.87 },
      mode: "walk" as const,
      resortId: "cortina",
      poiId: null,
      category: "resorts",
      rank: DEFAULT_RANK,
    };

    expect(parseViewState(serializeViewState(state))).toEqual(state);
  });
});

describe("rank options in the URL", () => {
  it("round-trips sort, date and filters", () => {
    const state: ViewState = {
      origin: { lat: 36.69, lng: 137.87 },
      mode: "drive" as const,
      resortId: null,
      poiId: null,
      category: "resorts",
      rank: {
        sort: "fresh_snow" as const,
        date: "2026-02-21",
        maxDriveMin: 20,
        nightSkiing: true,
        hvPass: false,
      },
    };

    expect(parseViewState(serializeViewState(state))).toEqual(state);
  });

  it("defaults to drive time, today and no filters", () => {
    expect(parseViewState("?sort=best&maxDrive=-3").rank).toEqual({
      sort: "drive_time",
      date: null,
      maxDriveMin: null,
      nightSkiing: false,
      hvPass: false,
    });
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
    });

    expect(search).toContain("cat=food");
    expect(parseViewState(search).poiId).toBe("osm:node/123");
    expect(search).not.toContain("resort=");
  });
});
