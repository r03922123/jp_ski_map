"use client";

import { CircleDot, CornerUpRight, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { MapCard } from "@/components/MapCard";
import type { Coord } from "@/lib/api";

// T2: one prominent action (Go here, Google's Directions; Start here in Bus), the rest
// outlined. Google's pills: an icon and a word, in one row that scrolls sideways
const PILL =
  "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium";
const PRIMARY = `${PILL} bg-primary text-primary-foreground shadow-sm hover:bg-primary/90`;
const SECONDARY = `${PILL} border bg-background text-primary hover:bg-muted`;
const ICON = "size-4";

/**
 * The card on a dropped pin (docs/ux/behaviour-cards.md BC-A1). In Google Maps a long-press
 * drops a pin and only a button on its card edits the trip. Ours offers what a ski trip
 * needs: Start here (where am I staying), Go here, Add stop. An action is shown only when
 * it applies (no `onGo` in Bus, no `onAddStop` without a destination).
 */
export function PinCard({
  name,
  coord,
  onStart,
  onGo,
  onAddStop,
  onClose,
  save,
}: {
  name: string | null;
  coord: Coord;
  onStart: () => void;
  onGo?: () => void;
  onAddStop?: () => void;
  onClose: () => void;
  /** the place's Save (☆) button, beside the actions */
  save?: ReactNode;
}) {
  return (
    <MapCard
      title={name ?? "Dropped pin"}
      subtitle={`${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`}
      onClose={onClose}
    >
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5">
        {onGo && (
          <button
            type="button"
            onClick={onGo}
            data-variant="primary"
            className={PRIMARY}
          >
            <CornerUpRight aria-hidden="true" className={ICON} />
            Go here
          </button>
        )}
        <button
          type="button"
          onClick={onStart}
          data-variant={onGo ? "secondary" : "primary"}
          className={onGo ? SECONDARY : PRIMARY}
        >
          <CircleDot aria-hidden="true" className={ICON} />
          Start here
        </button>
        {onAddStop && (
          <button
            type="button"
            onClick={onAddStop}
            data-variant="secondary"
            className={SECONDARY}
          >
            <Plus aria-hidden="true" className={ICON} />
            Add stop
          </button>
        )}
        {save}
      </div>
    </MapCard>
  );
}
