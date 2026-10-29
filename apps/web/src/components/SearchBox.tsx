"use client";

import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { fetchPlaces, type Place } from "@/lib/api";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const DEBOUNCE_MS = 300;

/** Hotel / place search (Photon) that also accepts a pasted Google Maps link. */
export function SearchBox({
  onSelect,
  onClear,
}: {
  onSelect: (place: Place) => void;
  /** The ✕ button: the text is cleared and the starting point should be dropped. */
  onClear?: () => void;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = useDebouncedValue(text.trim(), DEBOUNCE_MS);
  const listId = useId();

  const results = useQuery({
    queryKey: ["places", query],
    queryFn: () => fetchPlaces(query),
    enabled: query.length > 0,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const places = results.data ?? [];
  const showList = open && query.length > 0 && !results.isPending;

  function choose(place: Place) {
    onSelect(place);
    setText(place.name);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, places.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && places.length > 0) {
      e.preventDefault();
      choose(places[Math.max(active, 0)]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        type="search"
        role="combobox"
        aria-label="Search hotel or place"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        placeholder="Search hotel, or paste a Google Maps link"
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
      {text && (
        <button
          type="button"
          aria-label="Clear starting point"
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
      {showList && !results.isError && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border bg-background py-1 shadow-lg"
        >
          {places.length === 0 ? (
            <p className="px-4 py-2 text-sm text-muted-foreground">
              No matches. Paste a Google Maps link or tap the map.
            </p>
          ) : (
            places.map((p, i) => (
              // Combobox pattern: focus stays in the input (aria-activedescendant),
              // which owns the keyboard handling; options only take pointer clicks.
              // biome-ignore lint/a11y/useKeyWithClickEvents: keys handled on the input
              <div
                key={p.id}
                id={`${listId}-${i}`}
                role="option"
                tabIndex={-1}
                aria-selected={i === active}
                className="cursor-pointer px-4 py-2 text-sm aria-selected:bg-muted hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()} // keep input focus
                onClick={() => choose(p)}
              >
                <span className="font-medium">{p.name}</span>
                {p.address && (
                  <span className="block text-xs text-muted-foreground">
                    {p.address}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
