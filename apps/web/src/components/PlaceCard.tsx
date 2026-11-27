"use client";

import { CornerUpRight } from "lucide-react";
import { SaveButton } from "@/components/SaveButton";
import type { PlaceInput } from "@/lib/saved-places";

/**
 * Next steps under the one bar once a place is the start (SPEC-web-app v1.13 rule 2):
 * Directions makes it the destination instead; Save keeps it.
 */
export function PlaceCard({
  place,
  onDirections,
}: {
  place: PlaceInput;
  onDirections: () => void;
}) {
  return (
    <fieldset
      aria-label="From here"
      className="m-0 flex min-w-0 flex-wrap items-center gap-1.5 border-0 p-0"
    >
      <button
        type="button"
        className="flex h-9 items-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
        onClick={onDirections}
      >
        <CornerUpRight aria-hidden="true" className="size-4" />
        Directions
      </button>
      <SaveButton place={place} className="ml-auto" />
    </fieldset>
  );
}
