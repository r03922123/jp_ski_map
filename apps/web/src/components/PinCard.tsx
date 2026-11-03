"use client";

import { useEffect } from "react";

const ACTION =
  "border-2 border-[var(--ink)] bg-primary px-3 py-1 text-primary-foreground shadow-[2px_2px_0_var(--ink)]";

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
}: {
  name: string | null;
  onStart: () => void;
  onGo?: () => void;
  onAddStop?: () => void;
  onClose: () => void;
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
    <fieldset className="pixel-frame relative flex flex-col gap-2 px-3 py-2 pr-9 text-sm">
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
        <button type="button" onClick={onStart} className={ACTION}>
          Start here
        </button>
        {onGo && (
          <button type="button" onClick={onGo} className={ACTION}>
            Go here
          </button>
        )}
        {onAddStop && (
          <button type="button" onClick={onAddStop} className={ACTION}>
            Add stop
          </button>
        )}
      </div>
    </fieldset>
  );
}
