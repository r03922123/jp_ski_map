"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SaveButton } from "@/components/SaveButton";
import { SearchBox } from "@/components/SearchBox";
import type { Coord, Suggestion } from "@/lib/api";
import { kindFromSuggestion, type PlaceInput } from "@/lib/saved-places";

/** A stop row: filled with a place, or an empty box waiting for typing or a map tap. */
export type TripStop = { key: string; place: PlaceInput | null };

export type TripPanelProps = {
  /** null while the start is being changed: the stops and destination stay listed */
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
  onClearFrom: () => void;
  /** absent when the destination isn't the user's to clear (bus: its panel has the link) */
  onClearTo?: () => void;
};

/**
 * The trip, Google-style (SPEC-web-app v1.4): From, any stops, To, each with a Save star
 * and ✕. The start can also be retyped in the search box above.
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
  onClearFrom,
  onClearTo,
}: TripPanelProps) {
  const addRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Filling or removing a stop unmounts the focused control: hand focus to Add stop (or
  // the list) instead of letting it drop to the page.
  const [refocus, setRefocus] = useState(false);
  useEffect(() => {
    if (!refocus) return;
    (addRef.current ?? listRef.current)?.focus();
    setRefocus(false);
  }, [refocus]);
  const removeStop = (key: string) => {
    setRefocus(true);
    onRemoveStop(key);
  };

  if (!from && !to && stops.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <ul
        ref={listRef}
        tabIndex={-1}
        aria-label="Trip"
        className="flex flex-col rounded-lg border text-sm outline-none"
      >
        {from && (
          <Row
            marker="🔵"
            label="From"
            place={from}
            removeLabel="Remove starting point"
            onRemove={onClearFrom}
          />
        )}
        {stops.map((stop, i) =>
          stop.place ? (
            <Row
              key={stop.key}
              marker={String(i + 1)}
              label={`Stop ${i + 1}`}
              place={stop.place}
              removeLabel={`Remove stop ${i + 1}`}
              onRemove={() => removeStop(stop.key)}
            />
          ) : (
            <li
              key={stop.key}
              className="flex items-center gap-2 px-2 py-1 not-last:border-b"
            >
              <StopBadge n={i + 1} />
              <div className="min-w-0 flex-1">
                <SearchBox
                  ariaLabel={`Stop ${i + 1}`}
                  // the hint lives here: a line under the box would sit under its dropdown
                  placeholder="Search, or tap the map"
                  clearLabel={`Remove stop ${i + 1}`}
                  alwaysClearable
                  near={near}
                  autoFocus
                  onSelect={(s) => {
                    setRefocus(true);
                    onFillStop(stop.key, {
                      id: s.id,
                      name: s.name,
                      coord: s.coord,
                      kind: kindFromSuggestion(s.kind),
                    });
                  }}
                  onClear={() => removeStop(stop.key)}
                />
              </div>
            </li>
          ),
        )}
        {to && (
          // bus: the lodging, or the chosen option's stop, read-only. Drive and walk pass no `to`: their
          // destination is the To box in the trip card on top (v1.9)
          <Row
            marker="📍"
            label="To"
            place={to}
            removeLabel={onClearTo ? "Remove destination" : undefined}
            onRemove={onClearTo}
          />
        )}
      </ul>
      {canAddStop && (
        <button
          ref={addRef}
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

/**
 * The To box (SPEC-web-app v1.8 rule 1, BC-T1): a search box showing the destination's
 * name, with its Save star. Typing is a draft; a pick changes only the destination. It
 * lives in the trip card on top, under the From box (v1.9, BC-L1).
 */
export function DestinationBox({
  to,
  near,
  onChoose,
  onClear,
}: {
  to: PlaceInput | null;
  near: Coord | null;
  onChoose: (place: Suggestion) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <SearchBox
          ariaLabel="To"
          placeholder="Search a destination"
          // typing is a draft: leaving without a pick puts the name back (BC-T1)
          label={to?.name ?? null}
          restoreOnBlur
          clearLabel="Remove destination"
          near={near}
          onSelect={onChoose}
          onClear={onClear}
        />
      </div>
      {to && <SaveButton place={to} />}
    </div>
  );
}
