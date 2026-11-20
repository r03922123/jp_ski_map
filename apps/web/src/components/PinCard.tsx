"use client";

import { type ReactNode, useEffect } from "react";

// T2: one prominent action (Go here, Google's Directions; Start here in Bus), the rest outlined
const PRIMARY =
  "rounded-full bg-primary px-4 py-1 font-medium text-primary-foreground shadow-sm";
const SECONDARY =
  "rounded-full border bg-card px-4 py-1 font-medium text-primary hover:bg-muted";

/**
 * The card on a dropped pin (docs/ux/behaviour-cards.md BC-A1). In Google Maps a long-press
 * drops a pin and only a button on its card edits the trip. Ours offers what a ski trip
 * needs: Start here (where am I staying), Go here, Add stop. An action is shown only when
 * it applies (no `onGo` in Bus, no `onAddStop` without a destination).
 */
export function PinCard({
  name,
  onStart,
  onGo,
  onAddStop,
  onClose,
  save,
}: {
  name: string | null;
  onStart: () => void;
  onGo?: () => void;
  onAddStop?: () => void;
  onClose: () => void;
  /** the place's Save (☆) button, beside the actions */
  save?: ReactNode;
}) {
  const title = name ?? "Dropped pin";
  useEffect(() => {
    // Escape dismisses it, like the app's other pop-ups
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <fieldset className="surface relative rounded-xl flex flex-col gap-2 px-3 py-2 pr-9 text-sm">
      {/* float: a legend otherwise sits on the frame's border line. The legend names the
          card, so ✕ stays outside it */}
      <legend className="float-left font-medium">{title}</legend>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute top-1 right-1 px-2"
      >
        ✕
      </button>
      <div className="clear-left flex flex-wrap gap-2">
        {onGo && (
          <button
            type="button"
            onClick={onGo}
            data-variant="primary"
            className={PRIMARY}
          >
            Go here
          </button>
        )}
        <button
          type="button"
          onClick={onStart}
          data-variant={onGo ? "secondary" : "primary"}
          className={onGo ? SECONDARY : PRIMARY}
        >
          Start here
        </button>
        {onAddStop && (
          <button
            type="button"
            onClick={onAddStop}
            data-variant="secondary"
            className={SECONDARY}
          >
            Add stop
          </button>
        )}
        {save}
      </div>
    </fieldset>
  );
}
