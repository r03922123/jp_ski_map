import { Marker } from "react-map-gl/maplibre";
import type { Coord } from "@/lib/api";

/** The trip's stops, numbered 1, 2, … in order. */
export function TripStopMarkers({
  stops,
}: {
  stops: { coord: Coord; name: string }[];
}) {
  return stops.map((stop, i) => (
    <Marker
      // biome-ignore lint/suspicious/noArrayIndexKey: a stop is its position in the trip
      key={`trip-stop-${i}`}
      latitude={stop.coord.lat}
      longitude={stop.coord.lng}
      anchor="center"
      // above the route time chips (3): a chip can land right on a stop
      style={{ zIndex: 4 }}
      // a tap on a stop must not fall through to the map (moving the start, or
      // dropping a second stop on top of it)
      onClick={(e) => e.originalEvent.stopPropagation()}
    >
      <span
        role="img"
        aria-label={`Stop ${i + 1}: ${stop.name}`}
        data-trip-stop={i + 1}
        className="flex size-6 items-center justify-center rounded-full border-2 border-slate-800 bg-white text-xs font-bold shadow"
      >
        {i + 1}
      </span>
    </Marker>
  ));
}
