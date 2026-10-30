"use client";

import { Plus, X } from "lucide-react";
import { SaveButton } from "@/components/SaveButton";
import { SearchBox } from "@/components/SearchBox";
import type { Coord } from "@/lib/api";
import { kindFromSuggestion, type PlaceInput } from "@/lib/saved-places";

/** A stop row: filled with a place, or an empty box waiting for typing or a map tap. */
export type TripStop = { key: string; place: PlaceInput | null };

export type TripPanelProps = {
  from: PlaceInput | null;
  to: PlaceInput | null;
  stops: TripStop[];
  /** drive/walk with a start and a destination, under the stop limit */
  canAddStop: boolean;
  /** search bias for stop boxes (the map centre) */
  near: Coord | null;
  onAddStop: () => void;
  onRemoveStop: (key: string) => void;
  onFillStop: (key: string, place: PlaceInput) => void;
  onClearTo: () => void;
};

/**
 * The trip, Google-style (SPEC-web-app v1.4): From, any stops, To, each with a Save star.
 * The start is edited in the search box above; ✕ removes a stop or the destination.
 */
export function TripPanel({
  from,
  to,
  stops,
  canAddStop,
  near,
  onAddStop,
  onRemoveStop,
  onFillStop,
  onClearTo,
}: TripPanelProps) {
  if (!from && !to) return null;
  return (
    <div className="flex flex-col gap-1">
      <ul aria-label="Trip" className="flex flex-col rounded-lg border text-sm">
        {from && <Row marker="🔵" label="From" place={from} />}
        {stops.map((stop, i) =>
          stop.place ? (
            <Row
              key={stop.key}
              marker={String(i + 1)}
              label={`Stop ${i + 1}`}
              place={stop.place}
              removeLabel={`Remove stop ${i + 1}`}
              onRemove={() => onRemoveStop(stop.key)}
            />
          ) : (
            <li
              key={stop.key}
              className="flex flex-col gap-0.5 px-2 py-1 not-last:border-b"
            >
              <div className="flex items-center gap-2">
                <StopBadge n={i + 1} />
                <div className="min-w-0 flex-1">
                  <SearchBox
                    ariaLabel={`Stop ${i + 1}`}
                    placeholder="Add a stop"
                    clearLabel={`Remove stop ${i + 1}`}
                    near={near}
                    autoFocus
                    onSelect={(s) =>
                      onFillStop(stop.key, {
                        id: s.id,
                        name: s.name,
                        coord: s.coord,
                        kind: kindFromSuggestion(s.kind),
                      })
                    }
                    onClear={() => onRemoveStop(stop.key)}
                  />
                </div>
              </div>
              <p className="pl-7 text-xs text-muted-foreground">
                Type a place, or tap the map
              </p>
            </li>
          ),
        )}
        {to && (
          <Row
            marker="📍"
            label="To"
            place={to}
            removeLabel="Remove destination"
            onRemove={onClearTo}
          />
        )}
      </ul>
      {canAddStop && (
        <button
          type="button"
          aria-label="Add stop"
          className="flex items-center gap-1 self-start rounded-full px-2 py-1 text-sm font-medium text-blue-700 hover:bg-muted"
          onClick={onAddStop}
        >
          <Plus aria-hidden="true" className="size-4" /> Add stop
        </button>
      )}
    </div>
  );
}

function StopBadge({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-700 bg-white text-[10px] font-bold"
    >
      {n}
    </span>
  );
}

function Row({
  marker,
  label,
  place,
  removeLabel,
  onRemove,
}: {
  marker: string;
  label: string;
  place: PlaceInput;
  removeLabel?: string;
  onRemove?: () => void;
}) {
  return (
    <li className="flex items-center gap-2 px-2 py-1 not-last:border-b">
      {/^\d+$/.test(marker) ? (
        <StopBadge n={Number(marker)} />
      ) : (
        <span aria-hidden="true" className="w-5 text-center text-xs">
          {marker}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">
        <span className="sr-only">{label}: </span>
        {place.name}
      </span>
      <SaveButton place={place} />
      {onRemove && removeLabel && (
        <button
          type="button"
          aria-label={removeLabel}
          className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          onClick={onRemove}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </li>
  );
}
