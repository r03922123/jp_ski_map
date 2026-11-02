"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { type Coord, fetchSuggestions, type Suggestion } from "@/lib/api";
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
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<Suggestion[]>([]);
  const query = useDebouncedValue(text.trim(), DEBOUNCE_MS);
  const listId = useId();

  useEffect(() => setRecent(loadRecent()), []); // browser storage: client only
  useEffect(() => {
    if (label) setText(label);
  }, [label]);

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
    onSelect(s);
    // a touch screen's keyboard would stay up over the results (the rows keep the box
    // focused while pressed): let go, as Google Maps does; a desktop keeps focus
    if (window.matchMedia?.("(pointer: coarse)").matches)
      inputRef.current?.blur();
    rememberRecent(s);
    setRecent(loadRecent());
    setText(s.name);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && rows.length > 0) {
      e.preventDefault();
      choose(rows[Math.max(active, 0)]); // Enter = the top suggestion
    } else if (e.key === "Escape") {
      setOpen(false);
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
          setText(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {(text || alwaysClearable) && (
        <button
          type="button"
          aria-label={clearLabel}
          className="absolute inset-y-0 right-2 my-auto flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          onClick={() => {
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
              No matches. Paste a Google Maps link or tap the map.
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
