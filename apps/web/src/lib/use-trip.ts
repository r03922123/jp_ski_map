import { useEffect, useRef, useState } from "react";
import type { PanelMode } from "@/components/ModePanel";
import type { TripStop } from "@/components/TripPanel";
import type { BusOption, Coord, Resort, Suggestion } from "@/lib/api";
import { stopMatchName } from "@/lib/nav/bus-place";
import {
  kindFromSuggestion,
  type PlaceInput,
  pinId,
  type SavedPlace,
} from "@/lib/saved-places";
import type { ViewState } from "@/lib/url-state";

/** A free destination, with its name when it has one. */
export type TripPoint = { coord: Coord; name: string | null };

/**
 * The trip being planned: the mode, the start, the destination (a resort or a free
 * point), the stops between them and the tapped bus. Only `editTrip` and `restoreTrip`
 * make one, so the rules that keep these consistent (they cite SPEC-web-app) live there.
 */
export type TripState = {
  mode: PanelMode;
  origin: Coord | null;
  // the name the bus matcher reads: a searched or saved place's (a dropped pin has none)
  originName: string | null;
  // what the origin is, for saving it (a search result's id, else the pin's coordinate)
  originSource: PlaceInput | null;
  // text the app puts in the search box when it sets the origin itself
  searchLabel: string | null;
  // bumped to remount (empty) the From box
  searchKey: number;
  // the remount whose box takes focus (Directions: the start is what is typed next)
  focusedSearchKey: number | null;
  // the resort chosen as the destination: in a list, the To box, on the map or in the link
  chosenResortId: string | null;
  // a free destination (a saved place's or a pin's "Go here", a To-box place), with its
  // name when it has one; the link holds only the coordinate (names in the URL: cluster E)
  point: TripPoint | null;
  // stops between start and destination; an empty one is waiting for typing or a map tap
  stops: TripStop[];
  storedBusChoice: BusOption | null;
  // stop keys handed out so far
  stopKeys: number;
};

/** What the edits read from around the trip, as this render shows it. */
export type TripWorld = {
  resorts: Resort[] | undefined;
  savedPlaces: SavedPlace[];
  /** the From and To places as shown (lib/trip-places.ts) */
  fromPlace: PlaceInput | null;
  toPlace: PlaceInput | null;
  /** an open stop box takes the next map tap */
  placingStop: boolean;
};

/** A start the planner sets: a search pick, a saved place's Start from, a pin's Start here. */
export type StartPick =
  | { by: "search"; place: Suggestion }
  | { by: "saved"; place: SavedPlace }
  | { by: "pin"; pin: TripPoint };

/** One edit to the trip, named for what the user did. */
export type TripEvent =
  | { type: "startSet"; start: StartPick }
  | { type: "startCleared" }
  // the resort list, the ranking or the picker
  | { type: "resortChosen"; id: string }
  // the To box (SPEC-web-app v1.8, BC-T1)
  | {
      type: "destinationChosen";
      place: Pick<Suggestion, "id" | "name" | "coord" | "kind">;
    }
  | { type: "destinationCleared" }
  // Go here, a saved place's or a pin's
  | { type: "pointChosen"; point: TripPoint }
  // the place card's Directions: the start becomes the destination
  | { type: "directions" }
  | { type: "swapped" }
  | { type: "modeChanged"; mode: PanelMode }
  | { type: "busTapped"; bus: BusOption }
  // Free shuttles only was ticked
  | { type: "paidBusesHidden" }
  // an empty stop box, or a pin's Add stop
  | { type: "stopAdded"; place: PlaceInput | null }
  | { type: "stopFilled"; key: string; place: PlaceInput }
  | { type: "stopRemoved"; key: string }
  | { type: "stopMoved"; key: string; by: -1 | 1 }
  | { type: "mapTapped"; coord: Coord }
  | { type: "resortTapped"; id: string }
  | { type: "savedTapped"; id: string };

/** A panel the trip's rules open: a tapped resort's card (SPEC-ski-runs v1.4), or Saved on a place. */
export type TripOpens = { panel: "resortCard" | "saved"; id: string };

/** The Hakuba Valley Line, the paid day line (PAID_DAY_LINE in the API's bus query); the rest are free. */
const PAID_LINE = "line-v";

const NEW_TRIP: TripState = {
  mode: "walk",
  origin: null,
  originName: null,
  originSource: null,
  searchLabel: null,
  searchKey: 0,
  focusedSearchKey: null,
  chosenResortId: null,
  point: null,
  stops: [],
  storedBusChoice: null,
  stopKeys: 0,
};

export const pinPlace = (pin: TripPoint): PlaceInput => ({
  id: pinId(pin.coord),
  name: pin.name ?? "Dropped pin",
  coord: pin.coord,
  kind: "pin",
});

/**
 * The trip's resort: the chosen one, else a tapped bus's unless a point is the destination.
 * That bus doesn't narrow Bus's list (SPEC-web-app v1.13 rule 6), but Walk and the link
 * still go to its resort.
 */
export const selectedResortOf = (trip: TripState): string | null =>
  trip.chosenResortId ??
  (trip.point ? null : (trip.storedBusChoice?.resortId ?? null));

type StartFrom =
  | StartPick
  | { by: "swap"; place: PlaceInput }
  | { by: "hotel"; place: SavedPlace }
  | { by: "link"; coord: Coord };

// Sets the start, or clears it (null): the only writer of its fields, which each way of
// setting it fills in its own way.
function startAt(trip: TripState, from: StartFrom | null): TripState {
  if (!from) {
    return {
      ...trip,
      origin: null,
      originName: null,
      originSource: null,
      searchLabel: null,
    };
  }
  switch (from.by) {
    case "search": {
      const { place } = from;
      // the box shows the pick already, so the label stays
      return {
        ...trip,
        origin: place.coord,
        originName: place.name,
        originSource: {
          id: place.id,
          name: place.name,
          coord: place.coord,
          kind: kindFromSuggestion(place.kind),
        },
      };
    }
    case "saved": {
      const { place } = from;
      return {
        ...trip,
        origin: place.coord,
        originName: place.kind === "pin" ? null : place.name,
        originSource: place,
        searchLabel: place.name,
      };
    }
    case "pin": {
      const { pin } = from;
      // the box shows the new start, as Google's From box does ("Dropped pin" when it
      // has no name); a fresh box, so it replaces whatever was typed before (S1)
      return {
        ...trip,
        origin: pin.coord,
        originName: pin.name,
        originSource: pin.name ? pinPlace(pin) : null,
        searchLabel: pin.name ?? "Dropped pin",
        searchKey: trip.searchKey + 1,
      };
    }
    case "swap": {
      const { place } = from;
      // remounted: a label equal to the last one the app set wouldn't replace a typed start
      return {
        ...trip,
        origin: place.coord,
        originName: stopMatchName(place.name),
        originSource: place,
        searchLabel: place.name,
        searchKey: trip.searchKey + 1,
      };
    }
    case "hotel": {
      const { place } = from;
      return {
        ...trip,
        origin: place.coord,
        originName: place.name,
        originSource: place,
        searchLabel: `My hotel · ${place.name}`,
      };
    }
    case "link":
      return { ...trip, origin: from.coord };
  }
}

// the tapped bus goes, but the resort it set stays the destination
const dropBus = (trip: TripState): TripState => ({
  ...trip,
  chosenResortId: selectedResortOf(trip),
  storedBusChoice: null,
});

const clearStart = (trip: TripState): TripState => ({
  ...dropBus(startAt(trip, null)), // the bus was for the old start
  // an empty stop box would take the next tap, which is meant for the new start
  stops: trip.stops.filter((st) => st.place !== null),
});

// Choosing a resort replaces a saved place's "Go here". The To box and the Bus list follow
// the resort, so a bus to another one can't stay.
const selectResort = (trip: TripState, id: string): TripState => ({
  ...trip,
  storedBusChoice:
    trip.storedBusChoice?.resortId === id ? trip.storedBusChoice : null,
  chosenResortId: id,
  point: null,
});

/**
 * A place becomes the destination (SPEC-web-app v1.8, BC-T1): a known resort is selected
 * as the list does; any other place is a free destination with its name. The bus was
 * chosen for the old destination (v1.13 rule 5).
 */
function destinationAt(
  trip: TripState,
  place: Pick<PlaceInput, "id" | "name" | "coord"> & {
    kind: PlaceInput["kind"] | Suggestion["kind"];
  },
  resorts: Resort[] | undefined,
): TripState {
  const next = { ...trip, storedBusChoice: null };
  return place.kind === "resort" && resorts?.some((r) => r.id === place.id)
    ? { ...next, chosenResortId: place.id, point: null }
    : // no resort card stays pressed, and the link holds only the point (the same gap
      // in Go here is D5, cluster J)
      {
        ...next,
        chosenResortId: null,
        point: { coord: place.coord, name: place.name },
      };
}

const fillStop = (
  trip: TripState,
  key: string,
  place: PlaceInput,
): TripState => ({
  ...trip,
  stops: trip.stops.map((st) => (st.key === key ? { ...st, place } : st)),
});

const fillOpenStop = (trip: TripState, place: PlaceInput): TripState => {
  const open = trip.stops.find((st) => st.place === null);
  return open ? fillStop(trip, open.key, place) : trip;
};

/** The trip after one edit, and the panel the edit opens, if any. */
export function editTrip(
  trip: TripState,
  event: TripEvent,
  world: TripWorld,
): { trip: TripState; opens?: TripOpens } {
  switch (event.type) {
    case "startSet":
      return { trip: startAt(trip, event.start) };
    case "startCleared":
      return { trip: clearStart(trip) };
    case "resortChosen":
      return { trip: selectResort(trip, event.id) };
    case "destinationChosen":
      return { trip: destinationAt(trip, event.place, world.resorts) };
    case "destinationCleared":
      return {
        trip: {
          ...trip,
          storedBusChoice: null,
          chosenResortId: null,
          point: null,
        },
      };
    case "pointChosen":
      return { trip: { ...trip, point: event.point } };
    case "directions": {
      // From waits to be filled (rule 3)
      if (!world.fromPlace) return { trip };
      // the start goes first: clearing it keeps a tapped bus's resort, which the new
      // destination then replaces
      const next = destinationAt(
        clearStart(trip),
        world.fromPlace,
        world.resorts,
      );
      // the new, empty From box takes focus: the Directions button that had it is gone
      const searchKey = trip.searchKey + 1;
      return { trip: { ...next, searchKey, focusedSearchKey: searchKey } };
    }
    case "swapped": {
      // Back to the lodging in one tap (SPEC-web-app v1.10). The bus goes with the old
      // destination, its stop picked for the old start; a resort goes back to being
      // selected, so a second tap restores the trip.
      const { fromPlace, toPlace } = world;
      if (!fromPlace || !toPlace) return { trip };
      const next = destinationAt(
        startAt(trip, { by: "swap", place: toPlace }),
        fromPlace,
        world.resorts,
      );
      return { trip: { ...next, stops: [...trip.stops].reverse() } };
    }
    case "modeChanged":
      return {
        trip: {
          ...trip,
          mode: event.mode,
          // the destination may have changed on the other tab, and the bus with it
          storedBusChoice:
            event.mode === "bus" && trip.point ? null : trip.storedBusChoice,
        },
      };
    case "busTapped":
      return { trip: { ...trip, storedBusChoice: event.bus } };
    case "paidBusesHidden":
      // a chosen paid bus would stay on the map while its row is hidden
      return {
        trip: trip.storedBusChoice?.lineId === PAID_LINE ? dropBus(trip) : trip,
      };
    case "stopAdded": {
      const stopKeys = trip.stopKeys + 1;
      const stop = { key: `stop-${stopKeys}`, place: event.place };
      return { trip: { ...trip, stopKeys, stops: [...trip.stops, stop] } };
    }
    case "stopFilled":
      return { trip: fillStop(trip, event.key, event.place) };
    case "stopRemoved":
      return {
        trip: {
          ...trip,
          stops: trip.stops.filter((s) => s.key !== event.key),
        },
      };
    case "stopMoved": {
      // T4: swap a stop with its neighbour (by -1: earlier, 1: later); the ends stay put
      const i = trip.stops.findIndex((s) => s.key === event.key);
      const j = i + event.by;
      if (i < 0 || j < 0 || j >= trip.stops.length) return { trip };
      const stops = [...trip.stops];
      [stops[i], stops[j]] = [stops[j], stops[i]];
      return { trip: { ...trip, stops } };
    }
    case "mapTapped":
      // with a stop box open the tap is the stop (Google: "put a point on the map")
      return {
        trip: world.placingStop
          ? fillOpenStop(trip, pinPlace({ coord: event.coord, name: null }))
          : trip,
      };
    case "resortTapped": {
      // while placing a stop, a resort marker is the stop, not a new destination
      const r = world.placingStop
        ? world.resorts?.find((x) => x.id === event.id)
        : undefined;
      const at = r?.accessPoints[0]?.coord;
      if (r && at) {
        return {
          trip: fillOpenStop(trip, {
            id: r.id,
            name: r.name.en,
            coord: at,
            kind: "resort",
          }),
        };
      }
      return {
        trip: selectResort(trip, event.id),
        opens: { panel: "resortCard", id: event.id },
      };
    }
    case "savedTapped": {
      const place = world.placingStop
        ? world.savedPlaces.find((p) => p.id === event.id)
        : undefined;
      return place
        ? { trip: fillOpenStop(trip, place) }
        : { trip, opens: { panel: "saved", id: event.id } };
    }
  }
}

/**
 * The trip a link holds. With no start in it, the trip starts from My hotel, like Google
 * starting from Home.
 */
export function restoreTrip(
  view: ViewState,
  hotel: SavedPlace | undefined,
): TripState {
  const trip: TripState = {
    ...NEW_TRIP,
    mode: view.mode,
    chosenResortId: view.resortId,
    point: view.point ? { coord: view.point, name: null } : null,
    stops: view.stops.map((coord, i) => ({
      key: `stop-url-${i}`,
      place: pinPlace({ coord, name: null }),
    })),
  };
  if (view.origin) return startAt(trip, { by: "link", coord: view.origin });
  return hotel ? startAt(trip, { by: "hotel", place: hotel }) : trip;
}

/** The trip as React state: every change goes through `edit` or `restore`. */
export function useTrip() {
  const [trip, setTrip] = useState(NEW_TRIP);
  // edits read the trip as last edited, not as last rendered, so two in one tick both count
  const latest = useRef(trip);
  const commit = (next: TripState) => {
    latest.current = next;
    setTrip(next);
  };
  // Directions' focus is for one mount: the box has it by now, and a later remount of the same
  // box (the sheet coming back after navigation) must not take focus and open its list
  useEffect(() => {
    if (trip.focusedSearchKey === null) return;
    latest.current = { ...latest.current, focusedSearchKey: null };
    setTrip(latest.current);
  }, [trip.focusedSearchKey]);

  const filledStops = trip.stops.flatMap((st) => (st.place ? [st.place] : []));
  return {
    ...trip,
    selectedResortId: selectedResortOf(trip),
    filledStops,
    stopsKey: filledStops
      .map((st) => `${st.coord.lat},${st.coord.lng}`)
      .join(";"),
    /** Applies one edit; returns the panel it opens, for the caller to open. */
    edit: (event: TripEvent, world: TripWorld) => {
      const next = editTrip(latest.current, event, world);
      commit(next.trip);
      return next.opens;
    },
    restore: (view: ViewState, hotel: SavedPlace | undefined) =>
      commit(restoreTrip(view, hotel)),
  };
}

export type Trip = ReturnType<typeof useTrip>;
