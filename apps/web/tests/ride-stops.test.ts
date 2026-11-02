import { describe, expect, it } from "vitest";
import { rideStopFeatures } from "@/lib/ride-stops";

// Google-Maps-style transit leg: where you get on and off stand out (bigger dot, name
// always shown); the stops in between are small dots, named when zoomed in.
const stop = (name: string, lng: number) => ({
  name,
  coord: { lat: 36.7, lng },
});

describe("rideStopFeatures", () => {
  it("marks the first stop board, the last alight, the rest via, each with its name", () => {
    const fc = rideStopFeatures([
      stop("Happo Bus Terminal", 137.83),
      stop("Nakiyama", 137.84),
      stop("Echoland", 137.85),
      stop("Hakuba 47", 137.86),
    ]);
    expect(fc.features.map((f) => f.properties)).toEqual([
      { name: "Happo Bus Terminal", role: "board" },
      { name: "Nakiyama", role: "via" },
      { name: "Echoland", role: "via" },
      { name: "Hakuba 47", role: "alight" },
    ]);
    expect(fc.features[1].geometry.coordinates).toEqual([137.84, 36.7]);
  });

  it("a two-stop ride is just board and alight; no stops, no features", () => {
    expect(
      rideStopFeatures([stop("A", 1), stop("B", 2)]).features.map(
        (f) => f.properties.role,
      ),
    ).toEqual(["board", "alight"]);
    expect(rideStopFeatures([]).features).toEqual([]);
  });
});
