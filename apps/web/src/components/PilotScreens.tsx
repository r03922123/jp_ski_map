import { BusPilotView } from "@/components/BusPilotView";
import { PilotView } from "@/components/PilotView";
import { formatArrival } from "@/lib/format";
import { boardManually } from "@/lib/nav/bus-journey";
import type { usePilotSession } from "@/lib/nav/use-pilot-session";

/**
 * The navigation screens over the map: the turn-by-turn pilot (also the walk to a bus
 * stop), then the bus journey's wait, ride and arrival.
 */
export function PilotScreens({
  session,
  basis,
}: {
  session: ReturnType<typeof usePilotSession>;
  /** the bus times' source, shown on the bus journey */
  basis: "expected" | "published";
}) {
  const {
    pilot,
    pilotRoute,
    following,
    setFollowing,
    reroute,
    reroutes,
    busPlan,
    busState,
    setBusState,
    pastWalk,
    preview,
    now,
    exitPilot,
  } = session;
  return (
    <>
      {busPlan && pastWalk && (
        <BusPilotView
          plan={busPlan}
          state={busState}
          now={now}
          basis={basis}
          onBoard={() => setBusState(boardManually)}
          onExit={exitPilot}
        />
      )}
      {pilotRoute && !pastWalk && (
        <PilotView
          status={pilot}
          mode={pilotRoute.mode}
          following={following}
          reroute={reroute}
          reroutes={reroutes}
          footnote={
            busPlan
              ? `Then ${busPlan.option.routeName} from ${busPlan.stops[0].name} at ${formatArrival(new Date(busPlan.departsAtMs), 0)}`
              : undefined
          }
          busStops={
            busPlan
              ? busPlan.stops.slice(0, busPlan.alightIndex + 1)
              : undefined
          }
          onExit={exitPilot}
          onRecenter={() => setFollowing(true)}
          now={new Date()}
          preview={preview}
        />
      )}
    </>
  );
}
