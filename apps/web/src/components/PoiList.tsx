"use client";

import type { NearbyPoi } from "@/lib/api";
import { formatDistance, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PoiListState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; data: NearbyPoi[] };

export function PoiList({
  state,
  selectedId,
  onSelect,
}: {
  state: PoiListState;
  selectedId: string | null;
  onSelect: (poi: NearbyPoi) => void;
}) {
  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Finding places…</p>;
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn't load nearby places right now. Please try again shortly.
      </p>
    );
  }
  if (state.data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing of this kind is mapped nearby.
      </p>
    );
  }
  return (
    <ol aria-label="Nearby places" className="divide-y">
      {state.data.map((p) => {
        const detail = [p.brand, p.cuisine].filter(Boolean).join(" · ");
        return (
          <li key={p.id}>
            <button
              type="button"
              aria-pressed={p.id === selectedId}
              onClick={() => onSelect(p)}
              className={cn(
                "flex w-full items-start justify-between gap-3 px-1 py-2 text-left hover:bg-muted",
                p.id === selectedId && "bg-muted",
              )}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{p.name}</span>
                {p.nameJa && p.nameJa !== p.name && (
                  <span className="truncate text-xs text-muted-foreground">
                    {p.nameJa}
                  </span>
                )}
                {detail && (
                  <span className="text-xs text-muted-foreground">
                    {detail}
                  </span>
                )}
                {p.openingHours && (
                  <span className="text-xs text-muted-foreground">
                    Hours: {p.openingHours}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right text-sm">
                <span className="font-medium">
                  ~ {formatDuration(p.durationS)}
                </span>
                <br />
                <span className="text-xs text-muted-foreground">
                  {formatDistance(p.distanceM)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
