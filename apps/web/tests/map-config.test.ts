import { describe, expect, it } from "vitest";
import {
  HAKUBA_VIEW,
  MAP_ATTRIBUTION,
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

describe("map attribution", () => {
  const links = () => {
    const box = document.createElement("div");
    box.innerHTML = MAP_ATTRIBUTION;
    return [...box.querySelectorAll("a")];
  };
  const hrefOf = (text: string) =>
    links().find((a) => a.textContent === text)?.href;

  it("links the licences of the Overture places (ADR-0004)", () => {
    expect(hrefOf("Overture Maps Foundation")).toBe("https://overturemaps.org/");
    expect(hrefOf("licences")).toBe(
      "https://github.com/r03922123/jp_ski_map/blob/main/DATA-LICENSES.md",
    );
  });

  it("still credits the snow and shuttle sources", () => {
    expect(hrefOf("Open-Meteo")).toBe("https://open-meteo.com/");
    expect(hrefOf("Hakuba Valley")).toContain("hakubavalley.com");
  });

  it("opens every link in a new tab without an opener", () => {
    expect(links().length).toBeGreaterThan(0);
    expect(links().map((a) => [a.target, a.rel])).toEqual(
      links().map(() => ["_blank", "noopener"]),
    );
  });
});

describe("maplibre worker", () => {
  it("is served from public/ rather than resolved next to the bundled module", () => {
    expect(MAPLIBRE_WORKER_URL).toBe("/maplibre/maplibre-gl-worker.mjs");
  });
});
