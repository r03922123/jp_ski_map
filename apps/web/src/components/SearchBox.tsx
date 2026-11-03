"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { type Coord, fetchSuggestions, type Suggestion } from "@/lib/api";
import { useCoarsePointer } from "@/lib/device";
import { loadRecent, rememberRecent } from "@/lib/recent-searches";
import { savedMatches, useSaved } from "@/lib/saved-places";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const DEBOUNCE_MS = 150; // the index answers in milliseconds, so keep up with typing

const ICONS: Record<Suggestion["kind"], string> = {
  resort: "⛷",
  stop: "🚏",
  lodging: "🏨",
  food: "🍜",
  convenience: "🏪",
  place: "📍",
};

/** The name with its matched span in bold, like Google's suggestions. */
function Highlighted({
  name,
  match,
}: {
  name: string;
  match: Suggestion["match"];
}) {
  if (!match || match[0] < 0 || match[1] <= match[0]) return <>{name}</>;
  const [a, b] = match;
  return (
    <>
      {name.slice(0, a)}
      <b>{name.slice(a, b)}</b>
      {name.slice(b)}
    </>
  );
}

function Row({ s }: { s: Suggestion }) {
  const icon =
    s.source === "saved"
      ? s.detail?.startsWith("My hotel")
        ? "🏨"
        : "★"
      : (ICONS[s.kind] ?? "📍");
  return (
    <span className="flex items-start gap-2">
      <span
        aria-hidden="true"
        className={`mt-0.5 w-5 text-center ${s.source === "saved" ? "text-amber-500" : ""}`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">
          <Highlighted name={s.name} match={s.match} />
          {s.nameJa && s.nameJa !== s.name && (
            <span className="ml-2 font-normal text-muted-foreground">
              {s.nameJa}
            </span>
          )}
        </span>
        {s.detail && (
          <span className="truncate text-xs text-muted-foreground">
            {s.detail}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Search-as-you-type over our own place index (hotels, stops, resorts, food, konbini),
 * with Photon behind it and pasted Google Maps links handled by the API.
 */
export function SearchBox({
  onSelect,
  onClear,
  near = null,
  label,
  ariaLabel = "Search hotel or place",
  placeholder = "Search or paste a Maps link",
  clearLabel = "Clear starting point",
  alwaysClearable = false,
  autoFocus = false,
  restoreOnBlur = false,
}: {
  onSelect: (place: Suggestion) => void;
  /** The ✕ button: the text is cleared and the starting point should be dropped. */
  onClear?: () => void;
  /** Map centre: nearer places rank first. */
  near?: Coord | null;
  /** Text the app puts in the box when it sets the origin itself (e.g. My hotel). */
  label?: string | null;
  /** The box's accessible name (default: the starting-point search). */
  ariaLabel?: string;
  placeholder?: string;
  /** Accessible name of the ✕ button. */
  clearLabel?: string;
  /** Show ✕ even while the box is empty (a stop box: ✕ removes the stop). */
  alwaysClearable?: boolean;
  autoFocus?: boolean;
  /**
   * Typing is a draft (BC-T1): leaving the box (blur, Escape) without a pick puts `label`
   * back, so the box never disagrees with the map. The To box uses it; the From box
   * keeps what was typed.
   */
  restoreOnBlur?: boolean;
}) {
  const touch = useCoarsePointer();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<Suggestion[]>([]);
  // only typed text is a query: text the app puts in the box (a label, a pick) is not, or
  // every page with a destination would search for its name (found by the resilience
  // journey: a broken suggest endpoint crashed the page on load)
  const [typed, setTyped] = useState(false);
  const query = useDebouncedValue(typed ? text.trim() : "", DEBOUNCE_MS);
  const listId = useId();

  useEffect(() => setRecent(loadRecent()), []); // browser storage: client only
  // what the box last committed to (the app's label or the last pick): the draft rule
  // restores this, so a pick is never undone while the app catches up
  const committed = useRef(label ?? "");
  useEffect(() => {
    committed.current = label ?? "";
    setTyped(false);
    if (label) setText(label);
    // a box that mirrors the app (the To box) empties when the app clears it
    else if (restoreOnBlur) setText("");
  }, [label, restoreOnBlur]);

  const results = useQuery({
    queryKey: ["suggest", query, near],
    queryFn: () => fetchSuggestions(query, near),
    enabled: query.length > 0,
    retry: false,
    staleTime: 60_000,
    placeholderData: (previous) => previous, // keep rows while the next keystroke loads
  });
  const saved = useSaved();
  // Saved places first, like Google: instant (no request) and never listed twice.
  const savedRows = useMemo(() => savedMatches(saved, query), [saved, query]);
  const savedIds = new Set(savedRows.map((s) => s.id));
  const notSaved = (s: Suggestion) => !savedIds.has(s.id);
  const suggestions =
    query.length > 0
      ? [...savedRows, ...(results.data ?? []).filter(notSaved)]
      : [];
  const recentRows = [...savedRows, ...recent.filter(notSaved)];
  const showRecent = open && query.length === 0 && recentRows.length > 0;
  const showList =
    open &&
    query.length > 0 &&
    (results.data !== undefined || savedRows.length > 0);
  const rows = showRecent ? recentRows : suggestions;

  const inputRef = useRef<HTMLInputElement>(null);

  function choose(s: Suggestion) {
    // committed first: on touch the blur() below runs the draft rule, which must keep the pick
    committed.current = s.name;
    onSelect(s);
    // a touch screen's keyboard would stay up over the results (the rows keep the box
    // focused while pressed): let go, as Google Maps does; a desktop keeps focus
    if (window.matchMedia?.("(pointer: coarse)").matches)
      inputRef.current?.blur();
    rememberRecent(s);
    setRecent(loadRecent());
    setTyped(false);
    setText(s.name);
    setOpen(false);
    setActive(-1);
  }

  function restoreDraft() {
    setTyped(false);
    setText(committed.current);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Japanese input: Enter/Escape while composing confirm or cancel the kana→kanji
    // conversion; they are the input method's keys, not ours
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (
      e.key === "Enter" &&
      open &&
      rows.length > 0 &&
      // only an explicit choice: typed text (Enter = its top suggestion) or a row
      // highlighted with the arrows; never the top recent of a box nobody typed in
      (query.length > 0 || active >= 0)
    ) {
      e.preventDefault();
      choose(rows[Math.max(active, 0)]);
    } else if (e.key === "Escape") {
      if (restoreOnBlur) restoreDraft();
      else setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        // Form-filling extensions tag search inputs (e.g. data-sharkid) before hydration.
        suppressHydrationWarning
        type="search"
        role="combobox"
        aria-label={ariaLabel}
        // biome-ignore lint/a11y/noAutofocus: a new stop box takes focus, as in Google Maps
        autoFocus={autoFocus}
        aria-expanded={showList || showRecent}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        placeholder={placeholder}
        className="w-full rounded-full border bg-background py-2 pr-10 pl-4 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
        value={text}
        onChange={(e) => {
          setTyped(true);
          setText(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        // a row's mousedown keeps focus, so a pick never blurs first; on touch, choose()
        // blurs after onSelect and its own setText(s.name) wins
        onBlur={restoreOnBlur ? restoreDraft : undefined}
        onKeyDown={onKeyDown}
      />
      {(text || alwaysClearable) && (
        <button
          type="button"
          aria-label={clearLabel}
          className="absolute inset-y-0 right-2 my-auto flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          onClick={() => {
            committed.current = "";
            setText("");
            setOpen(false);
            setActive(-1);
            onClear?.();
          }}
        >
          ✕
        </button>
      )}
      {results.isError && (
        <p role="alert" className="mt-1 px-2 text-xs text-destructive">
          Search is unavailable right now — paste a Google Maps link or tap the
          map instead.
        </p>
      )}
      {(showList || showRecent) && !results.isError && (
        <div
          id={listId}
          role="listbox"
          aria-label={
            showRecent
              ? savedRows.length > 0
                ? "Saved and recent places"
                : "Recent searches"
              : "Search results"
          }
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-xl border bg-background py-1 shadow-lg"
        >
          {showRecent && (
            <p className="px-4 pt-1 pb-0.5 text-xs text-muted-foreground">
              {savedRows.length > 0 ? "Saved and recent" : "Recent"}
            </p>
          )}
          {rows.length === 0 ? (
            <p className="px-4 py-2 text-sm text-muted-foreground">
              No matches. Paste a Google Maps link or{" "}
              {touch ? "long-press" : "tap"} the map.
            </p>
          ) : (
            rows.map((s, i) => (
              // Combobox pattern: focus stays in the input (aria-activedescendant),
              // which owns the keyboard handling; options only take pointer clicks.
              // biome-ignore lint/a11y/useKeyWithClickEvents: keys handled on the input
              <div
                key={s.id}
                id={`${listId}-${i}`}
                role="option"
                tabIndex={-1}
                aria-selected={i === active}
                className="cursor-pointer px-3 py-1.5 text-sm aria-selected:bg-muted hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()} // keep input focus
                onClick={() => choose(s)}
              >
                <Row s={s} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
