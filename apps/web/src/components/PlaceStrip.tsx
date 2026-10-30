"use client";

import { SaveButton } from "@/components/SaveButton";
import type { PlaceInput } from "@/lib/saved-places";

/** The trip's two ends, each with a Save star (Google's place card, condensed). */
export function PlaceStrip({
  from,
  to,
}: {
  from: PlaceInput | null;
  to: PlaceInput | null;
}) {
  if (!from && !to) return null;
  return (
    <ul aria-label="Trip" className="flex flex-col rounded-lg border text-sm">
      {from && <Row marker="🔵" label="From" place={from} />}
      {to && <Row marker="📍" label="To" place={to} />}
    </ul>
  );
}

function Row({
  marker,
  label,
  place,
}: {
  marker: string;
  label: string;
  place: PlaceInput;
}) {
  return (
    <li className="flex items-center gap-2 px-2 py-1 not-last:border-b">
      <span aria-hidden="true" className="w-5 text-center text-xs">
        {marker}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="sr-only">{label}: </span>
        {place.name}
      </span>
      <SaveButton place={place} />
    </li>
  );
}
