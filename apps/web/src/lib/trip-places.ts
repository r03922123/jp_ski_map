import type { PanelMode } from "@/components/ModePanel";
import type { TripStop } from "@/components/TripPanel";
import type {
  BusOption,
  Coord,
  NearbyPoi,
  PoiCategory,
  Resort,
} from "@/lib/api";
import { alightIndexOf } from "@/lib/nav/bus-journey";
import {
  type PlaceInput,
  pinId,
  placeAt,
  type SavedState,
} from "@/lib/saved-places";
import { MAX_STOPS } from "@/lib/url-state";
import type { TripPoint } from "@/lib/use-trip";

/** The trip's free destination as a place: a saved place's, else a named pin. */
export function pointPlaceOf(
  savedState: SavedState,
  point: TripPoint | null,
): PlaceInput | null {
  return point
    ? (placeAt(savedState, point.coord) ?? {
        id: pinId(point.coord),
        name: point.name ?? "Chosen place",
        coord: point.coord,
        kind: "pin",
      })
    : null;
}

/**
 * What the planner shows for the trip, derived from its state on every render: the From
 * and To places, the stops as drawn, which resort labels stay on the map, whether a stop
 * or the swap can be added, and the keys that collapse or reveal the sheet.
 */
export function tripPlaces({
  mode,
  routeMode,
  origin,
  originSource,
  point,
  pointPlace,
  stops,
  stopsKey,
  selectedResortId,
  chosenResortId,
  poiId,
  poiCategory,
  resort,
  destination,
  selectedPoi,
  busPlace,
  busChoice,
  showNight,
  target,
  activeRoute,
  piloting,
  savedOpen,
  savedState,
  resorts,
  listsLoading,
}: {
  mode: PanelMode;
  routeMode: Exclude<PanelMode, "bus">;
  origin: Coord | null;
  originSource: PlaceInput | null;
  point: TripPoint | null;
  pointPlace: PlaceInput | null;
  stops: TripStop[];
  stopsKey: string;
  selectedResortId: string | null;
  /** the resort chosen as such, not through a tapped bus: it narrows the Bus list */
  chosenResortId: string | null;
  poiId: string | null;
  poiCategory: PoiCategory | null;
  /** the selected resort, and the access point the walk goes to */
  resort: Resort | undefined;
  destination: Coord | undefined;
  selectedPoi: NearbyPoi | null;
  busPlace: PlaceInput | null;
  busChoice: BusOption | null;
  showNight: boolean;
  target: Coord | null | undefined;
  activeRoute: number;
  piloting: boolean;
  savedOpen: boolean;
  savedState: SavedState;
  resorts: Resort[] | undefined;
  /** requests still in flight for a linked destination */
  listsLoading: { resorts: boolean; pois: boolean };
}) {
  // Map-tapped and linked stops are pins: name them as the start is named (a saved
  // place's name, else "Dropped pin") when drawn, so renumbering never strands a "Stop 2".
  const tripStops = stops.map((st) =>
    st.place?.kind === "pin"
      ? { ...st, place: placeAt(savedState, st.place.coord) ?? st.place }
      : st,
  );
  // An open stop box takes map taps only while it is on screen (SPEC-web-app v1.4).
  const placingStop =
    mode !== "bus" &&
    origin !== null &&
    !piloting &&
    !savedOpen &&
    stops.some((st) => st.place === null);
  // With both ends set only the trip's resort keeps its label (SPEC-web-app v1.12). An
  // open stop box is choosing again, and a resort can be tapped as the stop.
  const tripSet =
    origin !== null &&
    (mode === "bus"
      ? busPlace !== null || (busChoice !== null && !showNight)
      : Boolean(target));
  // a saved resort comes back as a point, but it is still that resort
  const pointResortId =
    pointPlace?.kind === "resort" &&
    resorts?.some((r) => r.id === pointPlace.id)
      ? pointPlace.id
      : null;
  const tripResortId =
    mode === "bus"
      ? (busChoice?.resortId ?? null)
      : point
        ? pointResortId
        : poiCategory
          ? null
          : selectedResortId;
  const shownResortIds =
    tripSet && !placingStop ? (tripResortId ? [tripResortId] : []) : undefined;
  const fromPlace: PlaceInput | null = origin
    ? (originSource ??
      placeAt(savedState, origin) ?? {
        id: pinId(origin),
        name: "Dropped pin",
        coord: origin,
        kind: "pin",
      })
    : null;
  // Bus's destination is the lodging or place, else the chosen bus's resort, where it
  // drops you, else the selected resort (SPEC-web-app v1.13 rule 5)
  const destinationResortId = pointResortId ?? chosenResortId;
  const busResort = resorts?.find(
    (r) => r.id === (busChoice?.resortId ?? destinationResortId),
  );
  const busResortAt = busChoice
    ? busChoice.rideStops[alightIndexOf(busChoice)]?.coord
    : pointResortId
      ? point?.coord
      : destination;
  const busResortPlace: PlaceInput | null = busResort
    ? {
        id: busResort.id,
        name: busResort.name.en,
        coord: busResortAt ?? busResort.accessPoints[0].coord,
        kind: "resort",
      }
    : null;
  const toPlace: PlaceInput | null =
    mode === "bus"
      ? (busPlace ?? busResortPlace)
      : pointPlace
        ? pointPlace
        : poiCategory
          ? selectedPoi
            ? {
                id: selectedPoi.id,
                name: selectedPoi.name,
                coord: selectedPoi.coord,
                kind: "poi",
              }
            : null
          : resort && destination
            ? {
                id: resort.id,
                name: resort.name.en,
                coord: destination,
                kind: "resort",
              }
            : null;
  // the To box in the trip card, once there is a start or a destination
  // two bars once there is a destination; until then one bar, with the place card under
  // it once there is a start (SPEC-web-app v1.13 rules 1, 2 and 4)
  const showToBox = toPlace !== null;
  // a linked destination whose list is still on its way: no card meanwhile, or Directions
  // would replace that destination with the start. Only a request in flight counts: Bus
  // never asks for the food list, and a failed request leaves the card usable
  const destinationLoading =
    toPlace === null &&
    ((selectedResortId !== null && listsLoading.resorts) ||
      (mode !== "bus" &&
        poiCategory !== null &&
        poiId !== null &&
        listsLoading.pois));
  // a new destination collapses the sheet so its route shows (v1.9 rule 4, cluster F)
  // bus: the chosen option is the answer too (code review: choosing one from a swiped-up
  // sheet left it at 80 % over the walk leg and the board stop)
  const busKey =
    mode === "bus" && busChoice
      ? `${busChoice.routeId}/${busChoice.trip}/${busChoice.boardStopId}`
      : "";
  const destinationKey = `${selectedResortId}|${poiId}|${point ? `${point.coord.lat},${point.coord.lng}` : ""}|${busKey}`;
  // with both ends set, anything that changes the route on screen reveals it too: a new
  // start, mode or stop, or another route option, tapped from a swiped-up sheet
  const routeKey =
    origin && target
      ? `${routeMode}|${origin.lat},${origin.lng}|${target.lat},${target.lng}|${stopsKey}|${activeRoute}`
      : "";

  const canAddStop =
    mode !== "bus" &&
    fromPlace !== null &&
    toPlace !== null &&
    stops.length < MAX_STOPS &&
    stops.every((s) => s.place !== null);
  // Back to the lodging in one tap (SPEC-web-app v1.10)
  const canSwap = fromPlace !== null && toPlace !== null;
  return {
    tripStops,
    placingStop,
    shownResortIds,
    fromPlace,
    toPlace,
    showToBox,
    destinationResortId,
    destinationLoading,
    canAddStop,
    canSwap,
    destinationKey,
    routeKey,
  };
}
