"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { StopList } from "@/components/StopList";
import type { BusOption, BusResult, NightResult, Resort } from "@/lib/api";
import { clampDepart, departRange } from "@/lib/depart-at";
import { formatDuration } from "@/lib/format";
import { alightIndexOf } from "@/lib/nav/bus-journey";
import { cn } from "@/lib/utils";

export const SHUTTLE_PAGE =
  "https://www.hakubavalley.com/en/access_en/shuttlebus_en/";

type Loadable<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; data: T };

export type BusPanelProps = {
  resorts: Resort[];
  result: Loadable<BusResult>;
  night: Loadable<NightResult>;
  showNight: boolean;
  onShowNightChange: (show: boolean) => void;
  /** local Hakuba time, "YYYY-MM-DDTHH:mm" */
  departAt: string;
  onDepartAtChange: (value: string) => void;
  selected: BusOption | null;
  onSelect: (option: BusOption) => void;
  /** Guide the chosen journey step by step (SPEC-pilot "bus pilot"). */
  onStart?: () => void;
  /** why Start didn't start (e.g. far from the stop) */
  startNote?: string | null;
};

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const hhmm = (iso: string) => clock.format(new Date(iso));
// "Dec 13": no year, timetables repeat each season
const monthDay = (ymd: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    month: "short",
    day: "numeric",
  }).format(new Date(`${ymd}T00:00:00+09:00`));
const walk = (s: number) => (s < 60 ? "<1 min" : formatDuration(s));

/** The stops this option rides through, boarding to getting off. */
export function rideStopRows(
  option: Pick<BusOption, "rideStops" | "alightStopId">,
) {
  return option.rideStops
    .slice(0, alightIndexOf(option) + 1)
    .map(({ stopId, name, time }) => ({ stopId, name, time }));
}

/**
 * The chosen option's answer (its journey and Start). It comes into view when it appears,
 * so a choice is never left below the sheet's fold (v1.9, cluster F; Google shows the
 * chosen trip, BC-L1).
 */
function ChosenTrip({
  revealKey,
  children,
}: {
  /** changes when the answer grows (Start arrives once the walk is known): reveal again */
  revealKey: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef(new Set<string>());
  // once per state: a route refetch that hides and brings back Start doesn't jump again
  useEffect(() => {
    if (shown.current.has(revealKey)) return;
    shown.current.add(revealKey);
    ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [revealKey]);
  return <div ref={ref}>{children}</div>;
}

/** Google-transit-style timeline for the chosen option: walk → board → ride → arrive. */
function Journey({ option }: { option: BusOption }) {
  const line = option.lineId.replace("line-", "").toUpperCase();
  const stops = Math.max(option.rideStops.length - 1, 0);
  const ride = option.timed
    ? `${stops} ${stops === 1 ? "stop" : "stops"} · ${
        option.rideS != null
          ? formatDuration(option.rideS)
          : "time not published"
      }`
    : `${stops} ${stops === 1 ? "stop" : "stops"} · times not published`;
  return (
    <ol
      aria-label="Journey"
      className="ml-1 flex flex-col gap-0.5 border-l-2 border-teal-700 pl-3 text-xs"
    >
      <li>
        🚶 Walk {walk(option.walkS)} to {option.boardStopName}
      </li>
      <li>
        🚏 Board {hhmm(option.departsAt)}
        {!option.timed && ` (departs ${option.firstStopName})`}
      </li>
      <li>
        🚌 Line {line} · {ride}
        <StopList stops={rideStopRows(option)} className="mt-0.5 mb-1" />
      </li>
      <li>⛷ Arrive{option.arrivesAt ? ` ${hhmm(option.arrivesAt)}` : ""}</li>
      <li className="text-muted-foreground">
        Bus path on the map is approximate.
      </li>
    </ol>
  );
}

function OptionButton({
  option,
  selected,
  onSelect,
}: {
  option: BusOption;
  selected: boolean;
  onSelect: (o: BusOption) => void;
}) {
  const line = option.lineId.replace("line-", "").toUpperCase();
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(option)}
      className={cn(
        "flex w-full items-start gap-2 rounded-lg p-2 text-left hover:bg-muted",
        selected && "bg-muted",
      )}
    >
      <span className="mt-0.5 rounded bg-teal-700 px-1.5 text-xs font-bold text-white">
        {line}
      </span>
      <span className="flex flex-col gap-0.5 text-sm">
        {option.timed && option.arrivesAt ? (
          <span className="font-semibold tabular-nums">
            {hhmm(option.departsAt)} → {hhmm(option.arrivesAt)}
            {option.rideS != null && (
              <span className="font-normal text-muted-foreground">
                {" "}
                ({formatDuration(option.rideS)})
              </span>
            )}
          </span>
        ) : (
          <span>
            <span className="font-semibold">
              Departs {option.firstStopName} {hhmm(option.departsAt)}
            </span>
            <span className="text-muted-foreground">
              {" "}
              · stop times not published
            </span>
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          Board {option.boardStopName} · walk {walk(option.walkS)} · wait{" "}
          {walk(option.waitS)}
        </span>
      </span>
    </button>
  );
}

function Results({
  resorts,
  result,
  selected,
  onSelect,
  onStart,
  startNote,
}: Pick<
  BusPanelProps,
  "resorts" | "result" | "selected" | "onSelect" | "onStart" | "startNote"
>) {
  if (result.status === "idle") return null;
  if (result.status === "loading") {
    return <p className="text-sm text-muted-foreground">Finding buses…</p>;
  }
  if (result.status === "error") {
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn't load shuttle times right now.
      </p>
    );
  }
  const data = result.data;
  if (data.status === "awaiting_review") {
    return (
      <p className="text-sm text-muted-foreground">
        The latest shuttle timetables are transcribed but still awaiting review,
        so they aren't shown yet.
      </p>
    );
  }
  if (data.status === "no_service") {
    return (
      <p className="text-sm text-muted-foreground">
        No shuttle service on this date
        {data.nextServiceDate
          ? ` — next from ${monthDay(data.nextServiceDate)}`
          : ""}
        .
        {data.basis === "expected" &&
          " That date is expected from last season's timetable."}
        {data.newerSourcePending &&
          " A new timetable is out and will be added soon."}
      </p>
    );
  }
  if (data.resorts.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <SeasonNotice data={data} />
        <p className="text-sm text-muted-foreground">
          No more departures after this time today.
        </p>
      </div>
    );
  }
  const names = new Map(resorts.map((r) => [r.id, r.name.en]));
  return (
    <div className="flex flex-col gap-3">
      <SeasonNotice data={data} />
      {data.resorts.map((r) => {
        const name = names.get(r.resortId) ?? r.resortId;
        return (
          <section
            key={r.resortId}
            aria-label={name}
            className="flex flex-col gap-1"
          >
            <h3 className="text-sm font-semibold">{name}</h3>
            {r.options.map((o) => {
              const isSelected =
                selected?.routeId === o.routeId &&
                selected.trip === o.trip &&
                selected.resortId === o.resortId;
              return (
                <div key={`${o.routeId}-${o.trip}-${o.boardStopId}`}>
                  <OptionButton
                    option={o}
                    selected={isSelected}
                    onSelect={onSelect}
                  />
                  {isSelected && (
                    <ChosenTrip revealKey={onStart ? "start" : "journey"}>
                      <Journey option={o} />
                      {onStart && (
                        <button
                          type="button"
                          aria-label="Start bus journey"
                          className="mt-1 ml-1 rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow hover:bg-blue-700"
                          onClick={onStart}
                        >
                          ▶ Start
                        </button>
                      )}
                      {startNote && (
                        <output className="mt-1 ml-1 block text-xs text-amber-800">
                          {startNote}
                        </output>
                      )}
                    </ChosenTrip>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

/** Whether the times are the published timetable or a projection of last season's. */
function SeasonNotice({
  data,
}: {
  data: Pick<BusResult, "basis" | "newerSourcePending">;
}) {
  if (data.basis !== "expected") {
    return <p className="text-xs text-muted-foreground">Scheduled times.</p>;
  }
  return (
    <p className="text-xs text-muted-foreground">
      <span className="mr-1.5 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">
        Expected
      </span>
      Based on last season's timetable.{" "}
      {data.newerSourcePending
        ? "A newer timetable is out and will be added soon, so check before you go."
        : "The operator hasn't published this season's yet, so check before you go."}
    </p>
  );
}

export function BusPanel(props: BusPanelProps) {
  const { departAt, onDepartAtChange, showNight, onShowNightChange, night } =
    props;
  // computed per render: a page left open overnight moves its range on
  const range = departRange();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="depart-at" className="font-medium">
            Leave after
          </label>
          <input
            id="depart-at"
            type="datetime-local"
            className="rounded-md border bg-background px-2 py-1"
            value={departAt}
            min={range.min}
            max={range.max}
            // a typed date can still fall outside min/max: pull it back in
            onChange={(e) =>
              onDepartAtChange(clampDepart(e.target.value, range))
            }
          />
        </div>
        <label className="flex items-center gap-2 pb-1">
          <input
            type="checkbox"
            checked={showNight}
            onChange={(e) => onShowNightChange(e.target.checked)}
          />
          Night bus
        </label>
      </div>

      {showNight ? (
        night.status === "success" && night.data.departures.length > 0 ? (
          <div className="flex flex-col gap-2">
            <SeasonNotice data={night.data} />
            <ol className="flex flex-col gap-1 text-sm">
              {night.data.departures.map((d) => (
                <li key={`${d.routeId}-${d.departsAt}-${d.boardStopId}`}>
                  <span className="font-semibold tabular-nums">
                    {hhmm(d.departsAt)}
                  </span>{" "}
                  from {d.boardStopName} towards {d.towards}
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · walk {walk(d.walkS)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {night.status === "loading"
              ? "Finding night buses…"
              : "No night bus from nearby stops at this time."}
          </p>
        )
      ) : (
        <Results {...props} />
      )}

      <p className="text-xs text-muted-foreground">
        Timetables may change without notice and buses can be full — arrive
        early. Source:{" "}
        <a
          className="underline"
          href={SHUTTLE_PAGE}
          target="_blank"
          rel="noopener"
        >
          Hakuba Valley shuttle timetables
        </a>
        .
      </p>
    </div>
  );
}
