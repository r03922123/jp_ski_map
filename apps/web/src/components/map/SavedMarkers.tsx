import { Marker } from "react-map-gl/maplibre";
import type { SavedMarker } from "@/lib/saved-places";

const SAVED_ICONS: Record<SavedMarker["icon"], string> = {
  hotel: "🏨",
  star: "⭐",
  heart: "❤️",
  flag: "🚩",
  bookmark: "🔖",
};

/** Saved places (SPEC-saved-places), each with its list's icon. */
export function SavedMarkers({
  saved,
  piloting,
  onSelectSaved,
}: {
  saved: SavedMarker[];
  piloting: boolean;
  onSelectSaved?: (id: string) => void;
}) {
  return saved.map((p) => (
    <Marker
      key={`saved-${p.id}`}
      latitude={p.coord.lat}
      longitude={p.coord.lng}
      anchor="center"
      onClick={(e) => {
        e.originalEvent.stopPropagation();
        if (!piloting) onSelectSaved?.(p.id); // navigating: the trip stays
      }}
    >
      <button
        type="button"
        data-saved-marker={p.id}
        aria-label={`Saved: ${p.name}`}
        title={p.name}
        className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-amber-50 text-sm shadow"
      >
        {SAVED_ICONS[p.icon]}
      </button>
    </Marker>
  ));
}
