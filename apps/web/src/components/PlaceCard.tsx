"use client";

import { CornerUpRight } from "lucide-react";
import { SaveButton } from "@/components/SaveButton";
import type { PlaceInput } from "@/lib/saved-places";
import type { DestinationCategory } from "@/lib/url-state";

const LISTS: [DestinationCategory, string][] = [
  ["resorts", "Ski"],
  ["food", "Food"],
  ["convenience", "Konbini"],
];

/**
 * Next steps under the one bar once a place is the start (SPEC-web-app v1.13 rule 2):
 * Directions makes it the destination instead; Ski, Food and Konbini pick the list of
 * destinations in the sheet; Save keeps it.
 */
export function PlaceCard({
  place,
  showLists,
  category,
  onDirections,
  onCategory,
}: {
  place: PlaceInput;
  /** Bus has no food or konbini list, and lists every resort already */
  showLists: boolean;
  category: DestinationCategory;
  onDirections: () => void;
  onCategory: (category: DestinationCategory) => void;
}) {
  return (
    <fieldset
      aria-label="From here"
      className="m-0 flex min-w-0 flex-wrap items-center gap-1.5 border-0 p-0"
    >
      <button
        type="button"
        className="flex h-9 items-center gap-1 rounded-full bg-blue-700 px-3 text-xs font-semibold text-white shadow-sm hover:bg-blue-800"
        onClick={onDirections}
      >
        <CornerUpRight aria-hidden="true" className="size-4" />
        Directions
      </button>
      {showLists &&
        LISTS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={category === value}
            className="h-9 rounded-full border bg-background px-2.5 text-xs font-medium hover:bg-muted aria-pressed:border-blue-700 aria-pressed:bg-blue-50"
            onClick={() => onCategory(value)}
          >
            {label}
          </button>
        ))}
      <SaveButton place={place} className="ml-auto" />
    </fieldset>
  );
}
