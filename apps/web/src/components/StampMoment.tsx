"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Hero } from "@/components/HeroMarker";
import { stampMoment } from "@/lib/game/stamp-moment";

/** "Stamp earned" (SPEC-progression): a dialog box with the riding hero, announced politely. */
export function StampMoment() {
  const moment = useSyncExternalStore(
    stampMoment.subscribe,
    stampMoment.get,
    () => null,
  );
  useEffect(() => {
    if (!moment) return;
    const id = setTimeout(() => stampMoment.dismiss(), 8000);
    return () => clearTimeout(id);
  }, [moment]);
  return (
    <output
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-1/4 z-30 flex justify-center px-4"
    >
      {moment && (
        <span className="pixel-frame pointer-events-auto flex items-center gap-3 px-4 py-3">
          <Hero pose="ride" alt="" scale={2} />
          <span className="flex flex-col">
            <span className="text-lg">Stamp earned!</span>
            <span>
              {moment.name} · World {moment.world}
            </span>
          </span>
          <button
            type="button"
            onClick={() => stampMoment.dismiss()}
            className="ml-2 border-2 border-[var(--ink)] bg-primary px-3 py-1 text-primary-foreground shadow-[2px_2px_0_var(--ink)]"
          >
            OK
          </button>
        </span>
      )}
    </output>
  );
}
