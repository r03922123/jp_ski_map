import { useMemo } from "react";
import type { Pose } from "@/lib/game/sprites";
import type { BusPlan, BusState } from "@/lib/nav/bus-journey";
import { cameraFor } from "@/lib/nav/camera";
import { projectForward, splitAt } from "@/lib/nav/project";
import type { PilotStatus } from "@/lib/nav/use-pilot";
import type { LngLat } from "@/lib/route-geo";

/**
 * What the map draws while navigating: the bus journey's line and stops, and the pilot's
 * camera, puck, covered part of the route and the rider's pose.
 */
export function usePilotMap({
  pilot,
  piloting,
  busPlan,
  busState,
  following,
  setFollowing,
  pose,
}: {
  pilot: PilotStatus;
  piloting: boolean;
  busPlan: BusPlan | null;
  busState: BusState;
  /** the camera follows the puck until the user moves the map */
  following: boolean;
  setFollowing: (following: boolean) => void;
  /** the rider's sprite pose (SPEC-game-theme) */
  pose: Pose;
}) {
  const busPhase = busPlan ? busState.phase : null;
  const pastWalk = busPhase !== null && busPhase !== "walk";
  // During a bus journey the map shows the bus line and every stop, in every phase.
  const busRide = useMemo(
    () =>
      busPlan
        ? {
            route: busPlan.line.route,
            stops: busPlan.stops
              .slice(0, busPlan.alightIndex + 1)
              .flatMap((st) =>
                st.coord
                  ? [
                      {
                        coord: { lat: st.coord[1], lng: st.coord[0] },
                        name: st.name,
                      },
                    ]
                  : [],
              ),
            label: null,
          }
        : null,
    [busPlan],
  );
  const projection = pilot.nav.projection;
  const onRoute = pilot.phase === "following" || pilot.phase === "arrived";
  const rideFix = busPhase === "ride" ? pilot.fix : null;
  const rideAt =
    busPlan && rideFix
      ? projectForward(busPlan.line, rideFix, busState.rideIndex, 80, 5000)
      : null;
  const rideCamera =
    busPlan && rideAt && rideFix
      ? cameraFor(busPlan.line, rideAt, rideFix)
      : null;
  const mapPilotBase =
    busPlan && rideAt && rideCamera
      ? {
          camera: rideCamera,
          puck: rideAt.point,
          heading: rideCamera.bearing,
          covered: splitAt(busPlan.line.coords, rideAt).covered,
          following,
          onUserMove: () => setFollowing(false),
        }
      : pastWalk && busPlan
        ? {
            camera: null, // waiting at the stop, or arrived: the view is the user's
            puck: pilot.fix ? ([pilot.fix.lng, pilot.fix.lat] as LngLat) : null,
            heading: null,
            // arrived: the whole ride reads as done
            covered: busPhase === "arrived" ? busPlan.line.coords : [],
            following,
            onUserMove: () => setFollowing(false),
          }
        : piloting
          ? {
              camera: pilot.camera,
              puck:
                onRoute && projection
                  ? projection.point
                  : pilot.fix
                    ? ([pilot.fix.lng, pilot.fix.lat] as LngLat)
                    : null,
              heading: pilot.camera?.bearing ?? null,
              covered:
                projection && pilot.route
                  ? splitAt(pilot.route.coords, projection).covered
                  : [],
              following,
              onUserMove: () => setFollowing(false),
            }
          : null;
  const mapPilot = mapPilotBase ? { ...mapPilotBase, pose } : null;
  return { busRide, mapPilot };
}
