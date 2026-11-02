import type { Coord } from "@/lib/api";

/** A stop of the bus ride drawn on the map: where it is and what it is called. */
export type RideStopMark = { coord: Coord; name: string };
export type RideStopRole = "board" | "via" | "alight";

/**
 * The ride's stops as map features, Google-Maps transit style: the stop where you get
 * on (first) and off (last) stand out; the stops in between are small dots.
 */
export function rideStopFeatures(stops: RideStopMark[]) {
  const last = stops.length - 1;
  return {
    type: "FeatureCollection" as const,
    features: stops.map((s, i) => ({
      type: "Feature" as const,
      properties: {
        name: s.name,
        role: (i === 0
          ? "board"
          : i === last
            ? "alight"
            : "via") as RideStopRole,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [s.coord.lng, s.coord.lat],
      },
    })),
  };
}
