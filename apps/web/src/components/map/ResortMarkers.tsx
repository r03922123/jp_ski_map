import { useMemo } from "react";
import { Marker } from "react-map-gl/maplibre";
import { PixelSprite } from "@/components/PixelSprite";
import type { Resort } from "@/lib/api";
import { worldBadge } from "@/lib/game/sprites";
import { worldNumbers } from "@/lib/game/worlds";

/** A chip per resort with its world badge; the selected one is highlighted. */
export function ResortMarkers({
  resorts,
  shownResortIds,
  selectedResortId,
  piloting,
  onSelectResort,
}: {
  resorts: Resort[];
  /** which resorts keep a label; every one when absent (numbers still count them all) */
  shownResortIds?: string[];
  selectedResortId: string | null;
  piloting: boolean;
  onSelectResort: (id: string) => void;
}) {
  const worlds = useMemo(() => worldNumbers(resorts), [resorts]);
  return resorts
    .filter((r) => !shownResortIds || shownResortIds.includes(r.id))
    .map((r) => {
      const point = r.accessPoints[0];
      const selected = r.id === selectedResortId;
      return (
        <Marker
          key={r.id}
          latitude={point.coord.lat}
          longitude={point.coord.lng}
          anchor="bottom"
          // labels stay readable above the idle hero (z auto), and the chosen world's
          // chip stays above the destination flag on the same spot
          style={{ zIndex: selected ? 2 : 1 }}
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            if (!piloting) onSelectResort(r.id); // navigating: the trip stays
          }}
        >
          <button
            type="button"
            aria-label={r.name.en}
            aria-pressed={selected}
            data-resort-marker={r.id}
            className={`flex items-center gap-1 rounded-full border border-white py-0.5 pr-2 pl-0.5 text-xs shadow-[0_1px_3px_rgb(60_64_67/0.45)] ${
              selected
                ? "bg-primary text-primary-foreground"
                : "bg-card text-card-foreground"
            }`}
          >
            <PixelSprite
              id={`world-${worlds.get(r.id)}`}
              sprite={worldBadge(worlds.get(r.id) ?? 0)}
              scale={1}
              alt=""
            />
            {r.name.en.replace(
              / (Snow Resort|Snow Field|Mountain Resort|Ski Resort.*)$/,
              "",
            )}
          </button>
        </Marker>
      );
    });
}
