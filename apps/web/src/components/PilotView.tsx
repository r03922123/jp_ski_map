"use client";

import { Crosshair, Volume2, VolumeX, X } from "lucide-react";
import { ManeuverIcon } from "@/components/ManeuverIcon";
import { StopList, type StopRow } from "@/components/StopList";
import { formatArrival, formatDistance, formatDuration } from "@/lib/format";
import type { PositionError } from "@/lib/nav/position";
import type { PilotStatus } from "@/lib/nav/use-pilot";
import type { RerouteState } from "@/lib/nav/use-reroute";

const ERROR_TEXT: Record<PositionError, string> = {
  denied:
    "Location is off for this site. Allow location in your browser's site settings, then start again.",
  unavailable:
    "Can't find your location right now. Step outside or wait a moment, then start again.",
  insecure:
    "Navigation needs a secure (https) page to use your location. Open the https address of this site.",
  unsupported: "This browser can't share your location, so it can't navigate.",
};

type Props = {
  status: PilotStatus;
  mode: "drive" | "walk";
  /** false once the user panned the map away from their position */
  following: boolean;
  reroute?: RerouteState;
  /** how many times the route was replaced (shown to tests as data-reroutes) */
  reroutes?: number;
  muted?: boolean;
  onToggleMute?: () => void;
  /** a line under the progress, e.g. the bus to catch after this walk */
  footnote?: string;
  /** walking to a bus stop: that bus's stops, listed under the footnote */
  busStops?: StopRow[];
  onExit: () => void;
  onRecenter: () => void;
  now: Date;
};

/** Google-style turn-by-turn overlay: next turn on top, arrival and time left below. */
export function PilotView({
  status,
  mode,
  following,
  reroute = "idle",
  reroutes = 0,
  muted = false,
  onToggleMute,
  footnote,
  busStops,
  onExit,
  onRecenter,
  now,
}: Props) {
  const { phase, error, guidance } = status;
  const next = guidance?.next;

  return (
    <div
      data-testid="pilot"
      data-nav-phase={error ? "error" : phase}
      data-nav-remaining-m={guidance ? Math.round(guidance.remainingM) : ""}
      data-reroutes={reroutes}
      className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between"
    >
      <section
        aria-label="Next turn"
        aria-live="polite"
        className="pointer-events-auto m-3 rounded-2xl bg-emerald-800 p-3 text-white shadow-lg md:mx-auto md:w-[28rem]"
      >
        {error ? (
          <p className="font-semibold">Navigation paused</p>
        ) : phase === "starting" ? (
          <p className="font-semibold">Finding your location…</p>
        ) : phase === "offRoute" ? (
          <p className="text-lg font-semibold">
            {reroute === "rerouting" ? "Rerouting…" : "Off route"}
          </p>
        ) : phase === "arrived" ? (
          <p className="flex items-center gap-2 text-lg font-semibold">
            <ManeuverIcon maneuver="arrive" className="size-6 text-white" />
            Destination
          </p>
        ) : status.nav.approachM !== null && !status.nav.projection ? (
          <div className="flex items-center gap-3">
            <ManeuverIcon
              maneuver="depart"
              className="size-10 shrink-0 text-white"
            />
            <div className="min-w-0">
              <p className="text-2xl font-bold">
                {formatDistance(status.nav.approachM)}
              </p>
              <p className="truncate text-base">
                Head to the route
                {status.route?.route.steps[0]
                  ? ` · ${status.route.route.steps[0].instruction}`
                  : ""}
              </p>
            </div>
          </div>
        ) : next ? (
          <div className="flex items-center gap-3">
            <ManeuverIcon
              maneuver={next.maneuver}
              className="size-10 shrink-0 text-white"
            />
            <div className="min-w-0">
              <p className="text-2xl font-bold">
                {formatDistance(next.distanceM)}
              </p>
              <p className="truncate text-base">{next.instruction}</p>
            </div>
          </div>
        ) : null}
        {reroute === "failed" && (
          <p className="mt-1 text-sm text-emerald-100">
            Can't reroute — continue to the blue line
          </p>
        )}
        {phase === "following" && guidance?.after && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-950/40 px-2 py-0.5 text-sm">
            Then
            <ManeuverIcon
              maneuver={guidance.after.maneuver}
              className="size-4 text-white"
            />
          </p>
        )}
      </section>

      {error && (
        <div
          role="alert"
          className="pointer-events-auto mx-3 rounded-2xl bg-background p-4 text-sm shadow-lg md:mx-auto md:w-[28rem]"
        >
          {ERROR_TEXT[error]}
        </div>
      )}

      <div className="pointer-events-auto flex flex-col items-end gap-2">
        {!following && phase === "following" && (
          <button
            type="button"
            aria-label="Re-centre"
            className="mr-3 flex items-center gap-1 rounded-full bg-background px-4 py-2 text-sm font-semibold text-blue-700 shadow-lg"
            onClick={onRecenter}
          >
            <Crosshair aria-hidden="true" className="size-4" /> Re-centre
          </button>
        )}
        <section
          aria-label="Trip progress"
          className="flex w-full items-center gap-3 rounded-t-2xl bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-2px_12px_rgb(0_0_0/0.15)] md:mx-auto md:mb-3 md:w-[28rem] md:rounded-2xl"
        >
          <div className="min-w-0 flex-1">
            {phase === "arrived" ? (
              <p className="text-lg font-semibold">You've arrived</p>
            ) : guidance ? (
              <>
                <p className="text-2xl font-bold text-emerald-700">
                  {formatArrival(now, guidance.remainingS)}
                </p>
                <p className="text-sm">
                  {formatDuration(guidance.remainingS)} ·{" "}
                  {formatDistance(guidance.remainingM)}
                  <span className="text-muted-foreground">
                    {" "}
                    · {mode === "drive" ? "🚗" : "🚶"}
                  </span>
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Waiting for GPS…</p>
            )}
            {footnote && (
              <p className="text-sm font-medium text-teal-800">{footnote}</p>
            )}
            {busStops && busStops.length > 0 && (
              <StopList
                stops={busStops}
                className="mt-1 max-h-28 overflow-y-auto"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Live traffic unavailable · typical road speeds
            </p>
          </div>
          {onToggleMute && (
            <button
              type="button"
              aria-label={muted ? "Unmute voice" : "Mute voice"}
              aria-pressed={muted}
              className="flex size-11 items-center justify-center rounded-full border bg-background shadow-sm"
              onClick={onToggleMute}
            >
              {muted ? (
                <VolumeX aria-hidden="true" className="size-5" />
              ) : (
                <Volume2 aria-hidden="true" className="size-5" />
              )}
            </button>
          )}
          <button
            type="button"
            aria-label="Exit navigation"
            className="flex size-11 items-center justify-center rounded-full bg-red-600 text-white shadow"
            onClick={onExit}
          >
            <X aria-hidden="true" className="size-6" />
          </button>
        </section>
      </div>
    </div>
  );
}
