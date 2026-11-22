"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { SaveButton } from "@/components/SaveButton";
import { SearchBox } from "@/components/SearchBox";
import type { Coord, Suggestion } from "@/lib/api";
import { kindFromSuggestion, type PlaceInput } from "@/lib/saved-places";

/** A stop row: filled with a place, or an empty box waiting for typing or a map tap. */
export type TripStop = { key: string; place: PlaceInput | null };

export type TripPanelProps = {
  /** null while the start is being changed: the stops stay listed */
  from: PlaceInput | null;
  stops: TripStop[];
  /** the Add destination button (the slot below), which takes focus after an edit */
  addStopRef: RefObject<HTMLButtonElement | null>;
  /** "+ Add destination" above the list (v1.18; it was the trip card's third row) */
  addDestination?: ReactNode;
  /** search bias for stop boxes (the map centre) */
  near: Coord | null;
  onRemoveStop: (key: string) => void;
  /** T4: reorder a stop (by -1: earlier, 1: later) */
  onMoveStop?: (key: string, by: -1 | 1) => void;
  onFillStop: (key: string, place: PlaceInput) => void;
  onClearFrom: () => void;
};

/**
 * The trip, Google-style (SPEC-web-app v1.4): From and any stops, each with a Save star
 * and ✕. The start can also be retyped in the search box above, beside the To box.
 */
export function TripPanel({
  from,
  stops,
  addStopRef,
  near,
  onRemoveStop,
  onMoveStop,
  onFillStop,
  onClearFrom,
  addDestination,
}: TripPanelProps) {
  const listRef = useRef<HTMLUListElement>(null);
  // Filling or removing a stop unmounts the focused control: hand focus to Add
  // destination (or the list) instead of letting it drop to the page.
  const [refocus, setRefocus] = useState(false);
  useEffect(() => {
    if (!refocus) return;
    (addStopRef.current ?? listRef.current)?.focus();
    setRefocus(false);
  }, [refocus, addStopRef]);
  // T4: reorder only filled stops; an open stop box would renumber the list but not the
  // route or the map (review of #117)
  const canReorder =
    onMoveStop !== undefined &&
    stops.length > 1 &&
    stops.every((st) => st.place !== null);
  const removeStop = (key: string) => {
    setRefocus(true);
    onRemoveStop(key);
  };

  if (!from && stops.length === 0 && !addDestination) return null;
  return (
    <div className="flex flex-col items-start gap-1">
      {/* above the list: two or more stops would push it under the sticky ETA row (v1.18) */}
      {addDestination}
      {(from || stops.length > 0) && (
        <ul
          ref={listRef}
          tabIndex={-1}
          aria-label="Trip"
          className="flex w-full flex-col rounded-lg border text-sm outline-none"
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
                move={
                  canReorder
                    ? {
                        up: i > 0 ? () => onMoveStop(stop.key, -1) : null,
                        down:
                          i < stops.length - 1
                            ? () => onMoveStop(stop.key, 1)
                            : null,
                      }
                    : undefined
                }
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
        </ul>
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
  move,
}: {
  marker: string;
  label: string;
  place: PlaceInput;
  removeLabel: string;
  onRemove: () => void;
  /** T4: both directions, null at an end (disabled, not removed: it may hold focus) */
  move?: { up: (() => void) | null; down: (() => void) | null };
}) {
  const moveClass =
    "flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted";
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
      {move &&
        (
          [
            ["up", move.up, ChevronUp],
            ["down", move.down, ChevronDown],
          ] as const
        ).map(([dir, onMove, Icon]) => (
          <button
            key={dir}
            type="button"
            aria-label={`Move ${label.toLowerCase()} ${dir}`}
            aria-disabled={onMove === null || undefined}
            className={`${moveClass} aria-disabled:opacity-40 aria-disabled:hover:bg-transparent`}
            onClick={() => onMove?.()}
          >
            <Icon aria-hidden="true" className="size-4" />
          </button>
        ))}
      <SaveButton place={place} />
      <button
        type="button"
        aria-label={removeLabel}
        className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        onClick={onRemove}
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </li>
  );
}

/**
 * The To box (SPEC-web-app v1.8 rule 1, BC-T1): a search box showing the destination's
 * name. Typing is a draft; a pick changes only the destination. It lives in the trip
 * card on top, under the From box (v1.9, BC-L1), with its Save star below (v1.13).
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
    <SearchBox
      ariaLabel="To"
      // v1.18: fits the narrower box at 360 px ("Search a destination" needed 160 of 142)
      placeholder="Where to?"
      // typing is a draft: leaving without a pick puts the name back (BC-T1)
      label={to?.name ?? null}
      restoreOnBlur
      clearLabel="Remove destination"
      near={near}
      onSelect={onChoose}
      onClear={onClear}
    />
  );
}
