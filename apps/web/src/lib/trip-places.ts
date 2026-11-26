import type { TripStop } from "@/components/TripPanel";
import type { Coord, RankedResort, Resort } from "@/lib/api";
import { alightIndexOf } from "@/lib/nav/bus-journey";
import { busChoiceFor } from "@/lib/nav/bus-place";
import {
  type PlaceInput,
  pinId,
  placeAt,
  type SavedState,
} from "@/lib/saved-places";
import { MAX_STOPS } from "@/lib/url-state";
import { selectedResortOf, stopsKeyOf, type TripState } from "@/lib/use-trip";

/** What the shown trip reads besides the trip itself. */
export type TripData = {
  resorts: { data: Resort[] | undefined; isLoading: boolean };
  /** the ranking for the trip's start; a placeholder is the previous start's */
  ranking: { data: RankedResort[] | undefined; isPlaceholderData: boolean };
  savedState: SavedState;
  /** Bus lists the night buses, which draw no trip */
  showNight: boolean;
};

const resortPlace = (resort: Resort, coord: Coord): PlaceInput => ({
  id: resort.id,
  name: resort.name.en,
  coord,
  kind: "resort",
});

/**
 * Where the trip goes, as the planner shows it, derived from the trip and the loaded data
 * on every render: the route's end, the From and To places, the map's destination marker
 * and resort labels, the resort the Bus list narrows to, the stops as drawn, and the keys
 * that collapse or reveal the sheet. Walk goes to the destination; Bus's route is the walk
 * to the tapped bus's stop.
 */
export function shownTrip(
  trip: TripState,
  { resorts, ranking, savedState, showNight }: TripData,
) {
  const { mode, origin, point, stops } = trip;
  const selectedResortId = selectedResortOf(trip);
  const known = (id: string | null) =>
    id !== null && resorts.data?.some((r) => r.id === id) ? id : null;
  // the free destination as a place: a saved place's, else a named pin
  const pointPlace: PlaceInput | null = point
    ? (placeAt(savedState, point.coord) ?? {
        id: pinId(point.coord),
        name: point.name ?? "Chosen place",
        coord: point.coord,
        kind: "pin",
      })
    : null;
  // a saved resort comes back as a point, but it is still that resort
  const pointResortId =
    pointPlace?.kind === "resort" ? known(pointPlace.id) : null;
  // Walk to the access point the ranking found nearest; otherwise the first one.
  const resort = resorts.data?.find((r) => r.id === selectedResortId);
  const nearestId = ranking.data?.find(
    (r) => r.resortId === selectedResortId,
  )?.accessPointId;
  const entrance = (
    resort?.accessPoints.find((a) => a.id === nearestId) ??
    resort?.accessPoints[0]
  )?.coord;
  const walkTarget = point?.coord ?? entrance;

  // Bus mode with a destination that isn't a resort: the way back (SPEC-web-app v1.11)
  const busPlace =
    mode === "bus" && pointPlace?.kind !== "resort" ? pointPlace : null;
  const busChoice = busChoiceFor(trip.storedBusChoice, busPlace !== null);
  const busStop =
    mode === "bus" && !showNight ? (busChoice?.boardStopCoord ?? null) : null;
  // the resort itself, not a tapped bus's: that would collapse the Bus list. Only a known
  // one: a stale link must not say there are no shuttles
  const onlyResortId = pointResortId ?? known(trip.chosenResortId);
  const busResort = resorts.data?.find(
    (r) => r.id === (busChoice?.resortId ?? onlyResortId),
  );
  const busResortPlace = busResort
    ? resortPlace(
        busResort,
        (busChoice
          ? busChoice.rideStops[alightIndexOf(busChoice)]?.coord
          : pointResortId
            ? point?.coord
            : entrance) ?? busResort.accessPoints[0].coord,
      )
    : null;

  // The trip's end in this mode: the route's target, the To place and the map's marker,
  // the resort whose label stays, and whether the destination is set.
  const end =
    mode === "bus"
      ? {
          target: busStop,
          // the lodging or place, else the chosen bus's resort, where it drops you, else
          // the selected resort (SPEC-web-app v1.13 rule 5)
          to: busPlace ?? busResortPlace,
          marker: busPlace?.coord ?? null,
          resortId: busChoice?.resortId ?? null,
          // no bus chosen and no place: no destination yet (v1.12 rule 2)
          set: busPlace !== null || (busChoice !== null && !showNight),
        }
      : {
          target: walkTarget,
          to:
            pointPlace ??
            (resort && entrance ? resortPlace(resort, entrance) : null),
          marker: walkTarget ?? null,
          resortId: point ? pointResortId : selectedResortId,
          set: walkTarget !== undefined,
        };
  const routeMode = mode === "bus" ? "walk" : mode;
  const toPlace = end.to;
  const fromPlace: PlaceInput | null = origin
    ? (trip.originSource ??
      placeAt(savedState, origin) ?? {
        id: pinId(origin),
        name: "Dropped pin",
        coord: origin,
        kind: "pin",
      })
    : null;
  // Bus draws no stops. Map-tapped and linked stops are pins: name them as the start is
  // named (a saved place's name, else "Dropped pin"), so renumbering never strands a "Stop 2".
  const tripStops: TripStop[] =
    mode === "bus"
      ? []
      : stops.map((st) =>
          st.place?.kind === "pin"
            ? { ...st, place: placeAt(savedState, st.place.coord) ?? st.place }
            : st,
        );
  // bus: the chosen option is the answer too (code review: choosing one from a swiped-up
  // sheet left it at 80 % over the walk leg and the board stop)
  const busKey =
    mode === "bus" && busChoice
      ? `${busChoice.routeId}/${busChoice.trip}/${busChoice.boardStopId}`
      : "";

  return {
    /** the trip's resort, pressed in the lists and on the map */
    selectedResortId,
    /** in bus mode, "walk": the route shown is the walk to the boarding stop */
    routeMode,
    /** where the route on screen goes */
    target: end.target,
    /**
     * Where every mode's tab time goes. Walk heads for the ranking's nearest entrance, so a
     * resort with several waits for this start's ranking (null meanwhile).
     */
    sharedTarget:
      point !== null ||
      (resort?.accessPoints.length ?? 0) <= 1 ||
      (ranking.data !== undefined && !ranking.isPlaceholderData)
        ? walkTarget
        : null,
    /** MapView's destination marker; in bus mode, only a place has one (v1.11 rule 6) */
    destinationMarker: end.marker,
    busPlace,
    /** the tapped bus, while the list it came from is showing */
    busChoice,
    /** where that bus is boarded, while Bus lists the day buses */
    busStop,
    onlyResortId,
    fromPlace,
    toPlace,
    // two bars once there is a destination; until then one bar, with the place card under
    // it once there is a start (SPEC-web-app v1.13 rules 1, 2 and 4)
    showToBox: toPlace !== null,
    tripStops,
    /** an empty stop box waits for a map tap, once there is a start (v1.4) */
    stopBoxOpen: origin !== null && tripStops.some((st) => st.place === null),
    /** With both ends set only the trip's resort keeps its label (SPEC-web-app v1.12); undefined keeps them all */
    shownResortIds:
      origin !== null && end.set
        ? end.resortId
          ? [end.resortId]
          : []
        : undefined,
    /** the link holds a destination (a point, or a resort chosen or set by a bus) */
    hasDestination: point !== null || selectedResortId !== null,
    // a linked destination whose resort list is still on its way: no card meanwhile, or
    // Directions would replace that destination with the start. Only a request in flight
    // counts: a failed request leaves the card usable
    destinationLoading:
      toPlace === null && selectedResortId !== null && resorts.isLoading,
    canAddStop:
      mode !== "bus" &&
      fromPlace !== null &&
      toPlace !== null &&
      stops.length < MAX_STOPS &&
      stops.every((s) => s.place !== null),
    // Back to the lodging in one tap (SPEC-web-app v1.10)
    canSwap: fromPlace !== null && toPlace !== null,
    // a new destination collapses the sheet so its route shows (v1.9 rule 4, cluster F)
    destinationKey: `${selectedResortId}|${point ? `${point.coord.lat},${point.coord.lng}` : ""}|${busKey}`,
    /**
     * With both ends set, anything that changes the route on screen reveals it too: a new
     * start, mode or stop. The caller adds the route option tapped from a swiped-up sheet.
     */
    routeKey:
      origin && end.target
        ? `${routeMode}|${origin.lat},${origin.lng}|${end.target.lat},${end.target.lng}|${stopsKeyOf(stops)}`
        : "",
  };
}
