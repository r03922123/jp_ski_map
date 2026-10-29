"use client";

import type { BusOption, BusResult, NightDeparture, Resort } from "@/lib/api";
import { formatDuration } from "@/lib/format";
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
  night: Loadable<NightDeparture[]>;
  showNight: boolean;
  onShowNightChange: (show: boolean) => void;
  /** local Hakuba time, "YYYY-MM-DDTHH:mm" */
  departAt: string;
  onDepartAtChange: (value: string) => void;
  selected: BusOption | null;
  onSelect: (option: BusOption) => void;
};

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const hhmm = (iso: string) => clock.format(new Date(iso));
const walk = (s: number) => (s < 60 ? "<1 min" : formatDuration(s));

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
}: Pick<BusPanelProps, "resorts" | "result" | "selected" | "onSelect">) {
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
        This season's shuttle timetables are transcribed but still awaiting
        review, so they aren't shown yet.
      </p>
    );
  }
  if (data.status === "no_service" || data.resorts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No shuttle service on this date
        {data.nextServiceDate ? ` — next from ${data.nextServiceDate}` : ""}.
        Shuttle timetables are published per season.
      </p>
    );
  }
  const names = new Map(resorts.map((r) => [r.id, r.name.en]));
  return (
    <div className="flex flex-col gap-3">
      {data.resorts.map((r) => {
        const name = names.get(r.resortId) ?? r.resortId;
        return (
          <section
            key={r.resortId}
            aria-label={name}
            className="flex flex-col gap-1"
          >
            <h3 className="text-sm font-semibold">{name}</h3>
            {r.options.map((o) => (
              <OptionButton
                key={`${o.routeId}-${o.trip}-${o.boardStopId}`}
                option={o}
                selected={
                  selected?.routeId === o.routeId &&
                  selected.trip === o.trip &&
                  selected.resortId === o.resortId
                }
                onSelect={onSelect}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

export function BusPanel(props: BusPanelProps) {
  const { departAt, onDepartAtChange, showNight, onShowNightChange, night } =
    props;
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
            onChange={(e) => onDepartAtChange(e.target.value)}
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
        night.status === "success" && night.data.length > 0 ? (
          <ol className="flex flex-col gap-1 text-sm">
            {night.data.map((d) => (
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
