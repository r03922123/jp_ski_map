import type { PanelMode } from "@/components/ModePanel";
import type { Coord, NearbyPoi, Resort, Suggestion } from "@/lib/api";
import { stopMatchName } from "@/lib/nav/bus-place";
import {
  kindFromSuggestion,
  type PlaceInput,
  pinId,
  type SavedPlace,
  type SavedState,
} from "@/lib/saved-places";
import type { DestinationCategory } from "@/lib/url-state";
import type { Trip, TripPoint } from "@/lib/use-trip";

/** The Hakuba Valley Line, the paid day line (PAID_DAY_LINE in the API's bus query); the rest are free. */
const PAID_LINE = "line-v";

export const pinPlace = (pin: TripPoint): PlaceInput => ({
  id: pinId(pin.coord),
  name: pin.name ?? "Dropped pin",
  coord: pin.coord,
  kind: "pin",
});

/**
 * The planner's edits to the trip, one per control: each keeps the start, destination,
 * stops and tapped bus consistent with one another (the rules cite SPEC-web-app). Plain
 * functions over this render's state, rebuilt on every render.
 */
export function tripActions(
  trip: Trip,
  {
    resorts,
    fromPlace,
    toPlace,
    placingStop,
    savedState,
    setFlyTo,
    setSavedOpen,
    setSavedFocus,
    setDroppedPin,
    openResortCard,
  }: {
    resorts: Resort[] | undefined;
    fromPlace: PlaceInput | null;
    toPlace: PlaceInput | null;
    /** an open stop box takes the next map tap */
    placingStop: boolean;
    savedState: SavedState;
    setFlyTo: (coord: Coord) => void;
    setSavedOpen: (open: boolean) => void;
    setSavedFocus: (id: string | null) => void;
    setDroppedPin: (pin: TripPoint | null) => void;
    /** the resort card (SPEC-ski-runs v1.4) */
    openResortCard: (resortId: string) => void;
  },
) {
  const {
    point,
    stops,
    storedBusChoice,
    setMode,
    setOrigin,
    setOriginName,
    setOriginSource,
    setSearchLabel,
    searchKey,
    setSearchKey,
    setFocusedSearchKey,
    setChosenResortId,
    setCategory,
    setPoiId,
    setPoint,
    setStops,
    setBusChoice,
    newStopKey,
    fillStop,
  } = trip;

  // Choosing a resort or nearby place replaces a saved place's "Go here".
  const selectResort = (id: string) => {
    // the To box and the Bus list follow the resort, so a bus to another one can't stay
    if (storedBusChoice?.resortId !== id) setBusChoice(null);
    setChosenResortId(id);
    setPoint(null);
  };
  // The To box (SPEC-web-app v1.8, BC-T1): a pick there changes only the destination. A
  // resort selects it as the list does (the resorts tab, or a food tab would win); any
  // other place is a free destination with its name.
  const chooseTo = (
    place: Pick<Suggestion, "id" | "name" | "coord" | "kind">,
  ) => {
    setBusChoice(null); // it was chosen for the old destination (v1.13 rule 5)
    if (place.kind === "resort" && resorts?.some((r) => r.id === place.id)) {
      setCategory("resorts");
      setPoiId(null);
      selectResort(place.id);
    } else {
      // the place replaces whatever was chosen: no resort card or food row stays pressed,
      // and the link holds only the point (the same gap in Go here is D5, cluster J)
      setChosenResortId(null);
      setPoiId(null);
      setPoint({ coord: place.coord, name: place.name });
    }
  };
  const clearTo = () => {
    setBusChoice(null);
    setChosenResortId(null);
    setPoiId(null);
    setPoint(null);
  };
  // the tapped bus goes, but the resort it set stays the destination
  const dropBusChoice = () => {
    const busResort = point ? null : storedBusChoice?.resortId;
    if (busResort) setChosenResortId((id) => id ?? busResort);
    setBusChoice(null);
  };
  const clearOrigin = () => {
    setOrigin(null);
    setOriginName(null);
    setOriginSource(null);
    setSearchLabel(null);
    dropBusChoice(); // it was for the old start
    // an empty stop box would take the next tap, which is meant for the new start
    setStops((list) => list.filter((st) => st.place !== null));
  };
  const fillOpenStop = (place: PlaceInput) => {
    const open = stops.find((st) => st.place === null);
    if (open) fillStop(open.key, place);
  };
  const addPinStop = (pin: TripPoint) =>
    setStops((list) => [...list, { key: newStopKey(), place: pinPlace(pin) }]);

  return {
    selectResort,
    chooseTo,
    clearTo,
    clearOrigin,
    /** Free shuttles only: a chosen paid bus would stay on the map while its row is hidden */
    dropPaidBus: () => {
      if (storedBusChoice?.lineId === PAID_LINE) dropBusChoice();
    },
    /** a search result becomes the start */
    searchStart: (place: Suggestion) => {
      setOrigin(place.coord);
      setOriginName(place.name);
      setOriginSource({
        id: place.id,
        name: place.name,
        coord: place.coord,
        kind: kindFromSuggestion(place.kind),
      });
      setFlyTo(place.coord);
    },
    startFrom: (place: SavedPlace) => {
      setOrigin(place.coord);
      setOriginName(place.kind === "pin" ? null : place.name);
      setOriginSource(place);
      setSearchLabel(place.name);
      setFlyTo(place.coord);
      setSavedOpen(false);
    },
    goTo: (place: SavedPlace) => {
      setPoint({ coord: place.coord, name: place.name });
      setSavedOpen(false);
    },
    // Directions: the start becomes the destination, and From waits to be filled (rule 3)
    directionsTo: () => {
      if (!fromPlace) return;
      // first: clearOrigin keeps a tapped bus's resort, which the new To then replaces
      clearOrigin();
      chooseTo({
        id: fromPlace.id,
        name: fromPlace.name,
        coord: fromPlace.coord,
        // a resort stays a resort; anything else is a named point
        kind: fromPlace.kind === "resort" ? "resort" : "place",
      });
      // the new, empty From box takes focus: the Directions button that had it is gone
      setSearchKey(searchKey + 1);
      setFocusedSearchKey(searchKey + 1);
    },
    // Back to the lodging in one tap (SPEC-web-app v1.10)
    swapTrip: () => {
      if (!fromPlace || !toPlace) return;
      setOrigin(toPlace.coord);
      setOriginName(stopMatchName(toPlace.name));
      setOriginSource(toPlace);
      setSearchLabel(toPlace.name);
      // remounted: a label equal to the last one the app set wouldn't replace a typed start
      setSearchKey((k) => k + 1);
      setPoiId(null);
      setBusChoice(null); // its stop was picked for the old start
      // a resort goes back to being selected, so a second tap restores the trip
      if (
        fromPlace.kind === "resort" &&
        resorts?.some((r) => r.id === fromPlace.id)
      ) {
        setCategory("resorts");
        setChosenResortId(fromPlace.id);
        setPoint(null);
      } else {
        setChosenResortId(null);
        setPoint({ coord: fromPlace.coord, name: fromPlace.name });
      }
      setStops((list) => [...list].reverse());
    },
    changeMode: (m: PanelMode) => {
      setMode(m);
      // the destination may have changed on the other tab, and the bus with it
      if (m === "bus" && point) setBusChoice(null);
    },
    pickCategory: (c: DestinationCategory) => {
      setCategory(c);
      setPoint(null);
    },
    selectPoi: (p: NearbyPoi) => {
      setPoiId(p.id);
      setPoint(null);
    },
    addStop: () => {
      setSavedOpen(false); // the stop box lives in the trip list, which Saved replaces
      setStops((list) => [...list, { key: newStopKey(), place: null }]);
    },
    removeStop: (key: string) =>
      setStops((list) => list.filter((s) => s.key !== key)),
    /** T4: swap a stop with its neighbour (by -1: earlier, 1: later); the ends stay put */
    moveStop: (key: string, by: -1 | 1) =>
      setStops((list) => {
        const i = list.findIndex((s) => s.key === key);
        const j = i + by;
        if (i < 0 || j < 0 || j >= list.length) return list;
        const next = [...list];
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      }),
    /** a map click with a stop box open is the stop (Google: "put a point on the map") */
    pickOnMap: (coord: Coord) => {
      if (placingStop) fillOpenStop(pinPlace({ coord, name: null }));
    },
    /** a tapped resort marker */
    selectResortOnMap: (id: string) => {
      // while placing a stop, a resort marker is the stop, not a new destination
      const r = placingStop ? resorts?.find((x) => x.id === id) : undefined;
      const at = r?.accessPoints[0]?.coord;
      if (r && at) {
        fillOpenStop({
          id: r.id,
          name: r.name.en,
          coord: at,
          kind: "resort",
        });
        return;
      }
      selectResort(id);
      openResortCard(id);
    },
    /** a tapped saved marker */
    selectSaved: (id: string) => {
      const place = placingStop
        ? savedState.places.find((p) => p.id === id)
        : undefined;
      if (place) {
        fillOpenStop(place);
        return;
      }
      setSavedFocus(id);
      setSavedOpen(true);
    },
    /** the pin card's buttons */
    pinStart: (pin: TripPoint) => {
      setOrigin(pin.coord);
      setOriginName(pin.name);
      setOriginSource(pin.name ? pinPlace(pin) : null);
      // the box shows the new start, as Google's From box does ("Dropped pin" when it
      // has no name); a fresh box, so it replaces whatever was typed before (S1)
      setSearchLabel(pin.name ?? "Dropped pin");
      setSearchKey((k) => k + 1);
      setDroppedPin(null);
    },
    pinGo: (pin: TripPoint) => {
      setPoint({ coord: pin.coord, name: pin.name });
      setDroppedPin(null);
    },
    pinAddStop: (pin: TripPoint) => {
      addPinStop(pin);
      setDroppedPin(null);
    },
  };
}
