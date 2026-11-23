import { useRef, useState } from "react";
import type { PanelMode } from "@/components/ModePanel";
import type { TripStop } from "@/components/TripPanel";
import type { BusOption, Coord } from "@/lib/api";
import type { PlaceInput } from "@/lib/saved-places";
import type { DestinationCategory } from "@/lib/url-state";

/** A free destination, with its name when it has one. */
export type TripPoint = { coord: Coord; name: string | null };

/**
 * The trip being planned: the mode, the start, the destination (a resort, a food row or
 * a free point), the stops between them and the tapped bus. State only; the edits that
 * keep these consistent are in lib/trip-actions.ts.
 */
export function useTrip() {
  const [mode, setMode] = useState<PanelMode>("drive");
  const [origin, setOrigin] = useState<Coord | null>(null);
  // name of the searched place, if the origin came from search (not a dropped pin)
  const [originName, setOriginName] = useState<string | null>(null);
  // what the origin is, for saving it (a search result's id, else the pin's coordinate)
  const [originSource, setOriginSource] = useState<PlaceInput | null>(null);
  // text the app puts in the search box when it sets the origin itself
  const [searchLabel, setSearchLabel] = useState<string | null>(null);
  // bumped to remount (empty) the From box
  const [searchKey, setSearchKey] = useState(0);
  // the remount whose box takes focus (Directions: the start is what is typed next)
  const [focusedSearchKey, setFocusedSearchKey] = useState<number | null>(null);
  // the resort chosen as the destination: in a list, the To box, on the map or in the link
  const [chosenResortId, setChosenResortId] = useState<string | null>(null);
  const [category, setCategory] = useState<DestinationCategory>("resorts");
  const [poiId, setPoiId] = useState<string | null>(null);
  // a free destination (a saved place's or a pin's "Go here", a To-box place), with its
  // name when it has one; the link holds only the coordinate (names in the URL: cluster E)
  const [point, setPoint] = useState<TripPoint | null>(null);
  // stops between start and destination; an empty one is waiting for typing or a map tap
  const [stops, setStops] = useState<TripStop[]>([]);
  const [storedBusChoice, setBusChoice] = useState<BusOption | null>(null);
  // The trip's resort: the chosen one, else a tapped bus's unless a point is the destination.
  // That bus doesn't narrow Bus's list (SPEC-web-app v1.13 rule 6), but Drive, Walk and the
  // link still go to its resort.
  const selectedResortId =
    chosenResortId ?? (point ? null : (storedBusChoice?.resortId ?? null));

  const stopKeys = useRef(0);
  const newStopKey = () => {
    stopKeys.current += 1;
    return `stop-${stopKeys.current}`;
  };
  const filledStops = stops.flatMap((st) => (st.place ? [st.place] : []));
  const stopsKey = filledStops
    .map((st) => `${st.coord.lat},${st.coord.lng}`)
    .join(";");
  const fillStop = (key: string, place: PlaceInput) =>
    setStops((list) =>
      list.map((st) => (st.key === key ? { ...st, place } : st)),
    );

  return {
    mode,
    setMode,
    origin,
    setOrigin,
    originName,
    setOriginName,
    originSource,
    setOriginSource,
    searchLabel,
    setSearchLabel,
    searchKey,
    setSearchKey,
    focusedSearchKey,
    setFocusedSearchKey,
    selectedResortId,
    chosenResortId,
    setChosenResortId,
    category,
    setCategory,
    poiId,
    setPoiId,
    point,
    setPoint,
    stops,
    setStops,
    storedBusChoice,
    setBusChoice,
    newStopKey,
    filledStops,
    stopsKey,
    fillStop,
  };
}

export type Trip = ReturnType<typeof useTrip>;
