"use client";

import {
  type DetailedHTMLProps,
  type HTMLAttributes,
  useEffect,
  useRef,
  useState,
} from "react";
import type { NearbyPoi } from "@/lib/api";
import { formatDistance, formatDuration } from "@/lib/format";
import { loadGooglePlaces } from "@/lib/google-maps";
import { cn } from "@/lib/utils";

type GmpProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "gmp-place-details-compact": GmpProps & { orientation?: string };
      "gmp-place-details-place-request": GmpProps & { place: string };
      "gmp-place-content-config": GmpProps;
      "gmp-place-media": GmpProps;
      "gmp-place-rating": GmpProps;
      "gmp-place-attribution": GmpProps;
    }
  }
}

/** Google's own card: rating, photo and attribution drawn by Places UI Kit; we hold only the ID. */
function GooglePlaceCard({
  apiKey,
  placeId,
}: {
  apiKey: string;
  placeId: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadGooglePlaces(apiKey).catch(() => live && setFailed(true));
    const card = ref.current;
    const fail = () => setFailed(true);
    card?.addEventListener("gmp-error", fail); // gmp-error doesn't bubble
    return () => {
      live = false;
      card?.removeEventListener("gmp-error", fail);
    };
  }, [apiKey]);
  if (failed) return null;
  return (
    <gmp-place-details-compact ref={ref} orientation="horizontal">
      <gmp-place-details-place-request place={placeId} />
      <gmp-place-content-config>
        <gmp-place-media />
        <gmp-place-rating />
        <gmp-place-attribution />
      </gmp-place-content-config>
    </gmp-place-details-compact>
  );
}

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
  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
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
            {p.id === selectedId && p.googlePlaceId && googleKey && (
              <GooglePlaceCard apiKey={googleKey} placeId={p.googlePlaceId} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
