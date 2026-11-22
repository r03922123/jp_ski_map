import { useEffect, useRef, useState } from "react";
import type { PanelMode } from "@/components/ModePanel";
import type { BusOption, Coord, Resort, Route } from "@/lib/api";
import { fetchPath, fetchRoutes } from "@/lib/api";
import { simulateRequested, usePilotAvailable } from "@/lib/device";
import { riderStore } from "@/lib/game/rider";
import { earnVisit } from "@/lib/game/stamp-moment";
import { arrivedAt } from "@/lib/game/stamps";
import { addTrip, coveredKm, journeyArrived, tripKm } from "@/lib/game/stats";
import { worldNumbers } from "@/lib/game/worlds";
import {
  type BusPlan,
  type BusState,
  initialBus,
  planBus,
  reduceBus,
} from "@/lib/nav/bus-journey";
import {
  geolocationSource,
  type PositionSource,
  simulatedSource,
} from "@/lib/nav/position";
import { isFarFromRoute, useRouteProximity } from "@/lib/nav/proximity";
import { type NumberedStop, numberStops, stopsAhead } from "@/lib/nav/stops";
import { usePilot } from "@/lib/nav/use-pilot";
import { useReroute } from "@/lib/nav/use-reroute";
import type { LngLat } from "@/lib/route-geo";
import { useNow } from "@/lib/use-now";
import { useHiddenTimeout, useWakeLock } from "@/lib/wake-lock";

/** Stop navigating after the page has been hidden this long (SPEC-pilot boundaries). */
const PILOT_HIDDEN_STOP_MS = 10 * 60_000;
const FAR_FROM_STOP =
  "Bus guidance works near the start. You're far from it right now.";
/** Preview, and `?simulate` in dev builds: replay the route at these speeds. */
const SIMULATED_MPS = { drive: 15, walk: 5 } as const;

/**
 * A navigation session (SPEC-pilot): Start freezes the planner's route, GPS (or a
 * simulation) drives it, reroutes replace it, and Exit or arrival ends it, counting the
 * trip for the rider's stats and stamps. A bus journey walks to the stop first, then
 * waits, rides and arrives with the bus.
 */
export function usePilotSession({
  mode,
  resorts,
  routes,
  activeRoute,
  target,
  viaStops,
  busChoice,
  rideRoute,
}: {
  mode: PanelMode;
  resorts: Resort[] | undefined;
  /** the planner's route options, and the one chosen */
  routes: Route[];
  activeRoute: number;
  target: Coord | null | undefined;
  viaStops: Coord[];
  /** bus mode: the chosen bus and its ride along the roads */
  busChoice: BusOption | null;
  rideRoute: Route | null;
}) {
  // Pilot (turn-by-turn): the route is frozen at Start; GPS (or a simulation) drives it.
  const [pilotRoute, setPilotRoute] = useState<Route | null>(null);
  const tripCounted = useRef(false);
  // SPEC-progression: only a trip on real GPS earns stamps or counts (never a preview or
  // ?simulate); captured at Start, so later planner edits can't change what was ridden
  const realTrip = useRef(false);
  /** the bus journey started at the stop: its "walk" leg is the bus line itself */
  const walkIsLine = useRef(false);
  const [pilotSource, setPilotSource] = useState<PositionSource | null>(null);
  const [following, setFollowing] = useState(true);
  // the destination stays fixed while reroutes replace the route
  const [pilotTarget, setPilotTarget] = useState<Coord | null>(null);
  // the trip's stops for this session, so a reroute still visits the ones ahead
  const [pilotStops, setPilotStops] = useState<NumberedStop[]>([]);
  const [reroutes, setReroutes] = useState(0);
  // Bus pilot: the walk leg uses the turn-by-turn pilot; then wait → ride → arrived.
  const [busPlan, setBusPlan] = useState<BusPlan | null>(null);
  const [busState, setBusState] = useState<BusState>(initialBus);
  const busPhase = busPlan ? busState.phase : null;
  const pastWalk = busPhase !== null && busPhase !== "walk";
  // Preview: the route plays instead of GPS (the phone is far from it; SPEC-pilot)
  const [preview, setPreview] = useState<null | "chosen" | "switched">(null);
  const [busNote, setBusNote] = useState<string | null>(null);
  const firstFixChecked = useRef(false);
  const pilot = usePilot(pilotRoute, pilotSource);
  const reroute = useReroute({
    // at the stop the walk route is done, and a preview has no position: never reroute
    phase: pastWalk || preview ? "following" : pilot.phase,
    fix: pilot.fix,
    mode: pilotRoute?.mode ?? "walk",
    target: pilotTarget,
    fetchRoute: async (m, from, to) => {
      const ahead = pilot.route
        ? stopsAhead(pilot.route, pilot.nav.lastGood?.alongM ?? 0, pilotStops)
        : pilotStops;
      const route =
        ahead.length > 0
          ? numberStops(
              await fetchPath(m, [from, ...ahead.map((s) => s.coord), to], {
                stopAtPoints: true,
              }),
              ahead.map((s) => s.n),
            )
          : (await fetchRoutes(m, from, to)).primary;
      // only now: a failed reroute keeps the old route, whose stops are all still listed
      setPilotStops(ahead);
      return route;
    },
    onNewRoute: (r) => {
      setPilotRoute(r);
      setReroutes((n) => n + 1);
    },
    // a fresh copy restarts matching on the old route, so the user can rejoin it
    onFailure: () => setPilotRoute((r) => (r ? { ...r } : r)),
  });
  const piloting = pilotRoute !== null;
  // Start is offered on touch-first devices only (SPEC-pilot "Devices")
  const pilotAvailable = usePilotAvailable();
  // is the phone near where this route starts? (read only if location is already allowed)
  const routeStart =
    (routes[activeRoute]?.geometry.coordinates[0] as LngLat | undefined) ??
    null;
  const proximity = useRouteProximity(routeStart, pilotAvailable && !piloting);
  const beginPilot = (
    route: Route,
    goal: Coord | null,
    {
      asPreview = false,
      stops: viaStopsForPilot = [],
    }: { asPreview?: boolean; stops?: NumberedStop[] } = {},
  ) => {
    const simulate =
      process.env.NODE_ENV !== "production" && simulateRequested();
    tripCounted.current = false; // a new trip for the rider's stats
    realTrip.current = !asPreview && !simulate;
    firstFixChecked.current = false;
    setPreview(asPreview ? "chosen" : null);
    setBusNote(null);
    setPilotRoute(route);
    setPilotTarget(goal);
    setPilotStops(viaStopsForPilot);
    setReroutes(0);
    setFollowing(true);
    setPilotSource(
      simulate || asPreview
        ? simulatedSource(
            route.geometry.coordinates as LngLat[],
            SIMULATED_MPS[route.mode],
          )
        : geolocationSource(),
    );
  };
  const startPilot = () => {
    const route = routes[activeRoute];
    if (route)
      beginPilot(route, target ?? null, {
        asPreview: proximity === "far",
        stops: viaStops.map((coord, i) => ({ n: i + 1, coord })),
      });
  };
  const startBusPilot = () => {
    if (!busChoice) return;
    if (proximity === "far") {
      setBusNote(FAR_FROM_STOP);
      return;
    }
    const plan = planBus(busChoice, rideRoute);
    setBusPlan(plan);
    setBusState(initialBus());
    // the walk to the boarding stop; already there → the bus line stands in
    walkIsLine.current = !routes[0];
    beginPilot(routes[0] ?? plan.line.route, busChoice.boardStopCoord);
  };
  const exitPilot = () => {
    if (
      pilotRoute &&
      realTrip.current &&
      !preview &&
      !tripCounted.current &&
      pilot.route
    ) {
      tripCounted.current = true;
      const along = pilot.nav.lastGood?.alongM ?? 0;
      const km =
        busPlan && busPhase === "ride"
          ? { bus: coveredKm(busState.alongM, busPlan.line.totalM) }
          : {
              [busPlan || mode === "walk" ? "walk" : "drive"]:
                busPlan && walkIsLine.current
                  ? 0
                  : coveredKm(along, pilot.route.totalM),
            };
      riderStore.update((s) => addTrip(s, km, false));
    }
    setPilotRoute(null);
    setPilotSource(null);
    setBusPlan(null);
    setPreview(null);
  };
  // Tapped Start without knowing where the phone is: the first fix decides.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per session, on its first fix
  useEffect(() => {
    const fix = pilot.fix;
    const route = pilotRoute;
    if (!fix || !route || preview || firstFixChecked.current) return;
    firstFixChecked.current = true;
    const start = route.geometry.coordinates[0] as LngLat;
    if (!isFarFromRoute(fix, start)) return;
    if (busPlan) {
      exitPilot(); // a bus journey depends on the real place and time: no preview
      setBusNote(FAR_FROM_STOP);
      return;
    }
    setPreview("switched");
    setPilotSource(
      simulatedSource(
        route.geometry.coordinates as LngLat[],
        SIMULATED_MPS[route.mode],
      ),
    );
  }, [pilot.fix]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: advance on each new fix
  useEffect(() => {
    const fix = pilot.fix;
    if (!busPlan || !fix) return;
    setBusState((s) =>
      reduceBus(s, busPlan, fix, Date.now(), pilot.phase === "arrived"),
    );
  }, [pilot.fix, busPlan]);
  const now = useNow(busPhase === "wait" ? 15_000 : null);
  // SPEC-progression: a trip that ends at a resort's base earns its stamp (the
  // position is compared and dropped; only the resort and the day are kept)
  // a bus journey arrives with the bus (its pilot route is only the walk to the stop)
  const tripArrived = journeyArrived(busPhase, pilot.phase);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on arrival
  useEffect(() => {
    if (!tripArrived || preview || !realTrip.current) return;
    if (pilot.fix && resorts) {
      const at = arrivedAt(resorts, pilot.fix);
      if (at) earnVisit(at, worldNumbers(resorts).get(at.id) ?? 0);
    }
    if (tripCounted.current) return;
    tripCounted.current = true;
    // stats: a navigated trip that arrived
    const km = tripKm({
      mode: busPlan ? "bus" : mode === "walk" ? "walk" : "drive",
      routeM: pilot.route?.totalM ?? 0,
      bus: busPlan
        ? {
            alongM: busState.alongM,
            lineM: busPlan.line.totalM,
            walkIsLine: walkIsLine.current,
          }
        : undefined,
    });
    riderStore.update((s) => addTrip(s, km, true));
  }, [tripArrived]);
  useWakeLock(piloting);
  useHiddenTimeout(piloting, PILOT_HIDDEN_STOP_MS, exitPilot);
  return {
    pilot,
    pilotRoute,
    piloting,
    reroute,
    reroutes,
    following,
    setFollowing,
    busPlan,
    busState,
    setBusState,
    busPhase,
    pastWalk,
    preview,
    busNote,
    now,
    pilotAvailable,
    proximity,
    startPilot,
    startBusPilot,
    exitPilot,
  };
}
