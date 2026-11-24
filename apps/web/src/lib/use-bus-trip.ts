import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { PanelMode } from "@/components/ModePanel";
import {
  type BusOption,
  type Coord,
  fetchBusOptions,
  fetchBusToPlace,
  fetchNightBus,
  fetchPath,
} from "@/lib/api";
import { nowInHakuba } from "@/lib/depart-at";
import { formatDuration } from "@/lib/format";
import { alightIndexOf } from "@/lib/nav/bus-journey";
import { busChoiceFor, stopMatchName } from "@/lib/nav/bus-place";
import type { PlaceInput } from "@/lib/saved-places";

type Loadable<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; data: T };

function loadable<T>(q: {
  isEnabled: boolean;
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
}): Loadable<T> {
  if (!q.isEnabled) return { status: "idle" };
  if (q.isPending) return { status: "loading" };
  if (q.isError || q.data === undefined) return { status: "error" };
  return { status: "success", data: q.data };
}

/**
 * Bus mode's answers: the shuttles to the resorts (or, with a destination that isn't a
 * resort, the way to it), the night buses, the leave-after time, and the chosen bus's ride
 * drawn along the roads.
 */
export function useBusTrip({
  mode,
  origin,
  originName,
  pointPlace,
  storedBusChoice,
}: {
  mode: PanelMode;
  origin: Coord | null;
  originName: string | null;
  /** the trip's free destination, if any */
  pointPlace: PlaceInput | null;
  /** the bus the user tapped, before it is checked against the destination */
  storedBusChoice: BusOption | null;
}) {
  const [departAt, setDepartAt] = useState("");
  const [showNight, setShowNight] = useState(false);
  useEffect(() => setDepartAt(nowInHakuba()), []); // client clock only, avoids SSR mismatch

  // Bus mode with a destination that isn't a resort: the way back (SPEC-web-app v1.11)
  const busPlace =
    mode === "bus" && pointPlace?.kind !== "resort" ? pointPlace : null;
  const busChoice = busChoiceFor(storedBusChoice, busPlace !== null);
  const busPlaceName = stopMatchName(busPlace?.name);
  const busEnabled = mode === "bus" && origin !== null && departAt !== "";
  const bus = useQuery({
    queryKey: ["bus", origin, departAt, originName],
    queryFn: () => fetchBusOptions(origin!, departAt, originName),
    enabled: busEnabled && !showNight && busPlace === null,
    retry: false,
  });
  const busToPlace = useQuery({
    queryKey: [
      "bus-to-place",
      origin,
      busPlace?.coord,
      departAt,
      originName,
      busPlaceName,
    ],
    queryFn: () =>
      fetchBusToPlace(
        origin!,
        busPlace!.coord,
        departAt,
        originName,
        busPlaceName,
      ),
    enabled: busEnabled && !showNight && busPlace !== null,
    retry: false,
  });
  const night = useQuery({
    queryKey: ["night-bus", origin, departAt],
    queryFn: () => fetchNightBus(origin!, departAt),
    enabled: busEnabled && showNight,
    retry: false,
  });
  const busStop =
    mode === "bus" && !showNight ? (busChoice?.boardStopCoord ?? null) : null;

  // The bus ride, drawn along the roads between its located stops (approximate).
  // To the stop where you get off (as the journey list), with names for the map.
  const rideStopMarks = useMemo(
    () =>
      busChoice
        ? busChoice.rideStops
            .slice(0, alightIndexOf(busChoice) + 1)
            .flatMap((s) => (s.coord ? [{ coord: s.coord, name: s.name }] : []))
        : [],
    [busChoice],
  );
  const rideStops = useMemo(
    () => rideStopMarks.map((m) => m.coord),
    [rideStopMarks],
  );
  const ride = useQuery({
    queryKey: [
      "ride",
      busChoice?.routeId,
      busChoice?.trip,
      busChoice?.boardStopId,
      busChoice?.alightStopId,
    ],
    queryFn: () => fetchPath("bus", rideStops),
    enabled: busStop !== null && rideStops.length >= 2,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  // Memoised: MapView re-fits the map when this changes, so it must not be a new
  // object on every render (that re-fit after each pan looped under reduced motion).
  const rideLeg = useMemo(
    () =>
      busStop !== null && busChoice && ride.data
        ? {
            route: ride.data,
            stops: rideStopMarks,
            label:
              busChoice.rideS != null ? formatDuration(busChoice.rideS) : null,
          }
        : null,
    [busStop, busChoice, ride.data, rideStopMarks],
  );

  return {
    busPlace,
    busChoice,
    busStop,
    /** the chosen bus's ride along the roads, once known */
    rideRoute: ride.data ?? null,
    rideLeg,
    results: {
      bus: loadable(bus),
      toPlace: loadable(busToPlace),
      night: loadable(night),
    },
    /** whether the shown buses come from this season's timetable or last season's */
    basis: ((busPlace ? busToPlace.data : bus.data)?.basis === "expected"
      ? "expected"
      : "published") as "expected" | "published",
    departAt,
    setDepartAt,
    showNight,
    setShowNight,
  };
}
