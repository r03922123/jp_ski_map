import { describe, expect, it } from "vitest";
import {
  HAKUBA_VIEW,
  MAP_STYLE_URL,
  MAPLIBRE_WORKER_URL,
} from "@/lib/map-config";

describe("map-config", () => {
  it("centers the initial view on Hakuba Valley", () => {
    expect(HAKUBA_VIEW).toEqual({
      latitude: 36.7,
      longitude: 137.86,
      zoom: 11,
    });
  });

  it("uses the keyless OpenFreeMap liberty style", () => {
    expect(MAP_STYLE_URL).toBe("https://tiles.openfreemap.org/styles/liberty");
  });
});

describe("maplibre worker", () => {
  it("is served from public/ rather than resolved next to the bundled module", () => {
    expect(MAPLIBRE_WORKER_URL).toBe("/maplibre/maplibre-gl-worker.mjs");
  });
});
