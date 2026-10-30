"use client";

import { Bus, MapPin, Volume2, VolumeX, X } from "lucide-react";
import { StopList } from "@/components/StopList";
import { formatArrival } from "@/lib/format";
import { type BusPlan, type BusState, rideView } from "@/lib/nav/bus-journey";

type Props = {
  plan: BusPlan;
  state: BusState;
  now: Date;
  /** "expected": times projected from last season's timetable */
  basis: "published" | "expected";
  onBoard: () => void;
  onExit: () => void;
  muted: boolean;
  onToggleMute: () => void;
};

/** Waiting for and riding the shuttle: countdown, stops to go, when to get off. */
export function BusPilotView({
  plan,
  state,
  now,
  basis,
  onBoard,
  onExit,
  muted,
  onToggleMute,
}: Props) {
  const { option, stops } = plan;
  const board = stops[0];
  const alight = stops[plan.alightIndex];
  const departs = formatArrival(new Date(plan.departsAtMs), 0);
  const minutes = Math.round((plan.departsAtMs - now.getTime()) / 60_000);
  const countdown =
    minutes > 0
      ? `in ${minutes} min`
      : minutes === 0
        ? "due now"
        : `left ${-minutes} min ago`;
  const ride = state.phase === "ride" ? rideView(plan, state) : null;
  const timesLabel =
    basis === "expected"
      ? "Expected times (based on last season)"
      : "Scheduled times";

  return (
    <div
      data-testid="bus-pilot"
      data-bus-phase={state.phase}
      className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between"
    >
      <section
        aria-label="Bus journey"
        aria-live="polite"
        className="pointer-events-auto m-3 rounded-2xl bg-teal-800 p-3 text-white shadow-lg md:mx-auto md:w-[28rem]"
      >
        <p className="flex items-center gap-2 text-lg font-semibold">
          {state.phase === "arrived" ? (
            <MapPin aria-hidden="true" className="size-6 shrink-0" />
          ) : (
            <Bus aria-hidden="true" className="size-6 shrink-0" />
          )}
          {state.phase === "wait"
            ? `Wait at ${board.name}`
            : state.phase === "arrived"
              ? `You've arrived at ${alight.name}`
              : ride?.getOffNext
                ? `Get off at ${alight.name} — next stop`
                : `${ride?.stopsToGo ?? ""} stops to go · next ${ride?.next.name ?? ""}`}
        </p>
      </section>

      <section
        aria-label="Bus progress"
        className="pointer-events-auto flex w-full items-end gap-3 rounded-t-2xl bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-2px_12px_rgb(0_0_0/0.15)] md:mx-auto md:mb-3 md:w-[28rem] md:rounded-2xl"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-teal-800">
            {option.routeName}
          </p>
          {state.phase === "wait" && (
            <>
              <p className="text-2xl font-bold">
                {departs}{" "}
                <span className="text-base font-medium">· {countdown}</span>
              </p>
              <button
                type="button"
                className="mt-2 rounded-full border border-teal-700 px-3 py-1 text-sm font-medium text-teal-800"
                onClick={onBoard}
              >
                I'm on the bus
              </button>
            </>
          )}
          {(state.phase === "wait" || state.phase === "ride") && (
            // every stop, boarding to getting off: never cut short (SPEC-pilot)
            <StopList
              stops={stops.slice(0, plan.alightIndex + 1)}
              nextIndex={ride ? ride.nextIndex : null}
              className="mt-1 max-h-40 overflow-y-auto"
            />
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {timesLabel} · no live bus position
          </p>
        </div>
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
  );
}
