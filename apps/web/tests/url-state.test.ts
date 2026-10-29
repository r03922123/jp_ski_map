import { describe, expect, it } from "vitest";
import { parseViewState, serializeViewState } from "@/lib/url-state";

describe("parseViewState", () => {
  it("reads origin, mode and resort", () => {
    expect(
      parseViewState("?from=36.69,137.87&mode=walk&resort=happo-one"),
    ).toEqual({
      origin: { lat: 36.69, lng: 137.87 },
      mode: "walk",
      resortId: "happo-one",
    });
  });

  it("falls back to defaults for missing or invalid values", () => {
    expect(parseViewState("?from=abc&mode=fly")).toEqual({
      origin: null,
      mode: "drive",
      resortId: null,
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
      }),
    ).toBe("?from=36.69123%2C137.87123&mode=drive");
  });

  it("round-trips through parse", () => {
    const state = {
      origin: { lat: 36.69, lng: 137.87 },
      mode: "walk" as const,
      resortId: "cortina",
    };

    expect(parseViewState(serializeViewState(state))).toEqual(state);
  });
});
