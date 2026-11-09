"use client";

import { Plus } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { Hero } from "@/components/HeroMarker";
import { PixelSprite } from "@/components/PixelSprite";
import { ICONS } from "@/lib/game/sprites";

/** A row's place on the rail: a fixed width, so both boxes come out the same length. */
function RailStop({
  stop,
  children,
}: {
  stop: "from" | "to";
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      data-trip-rail={stop}
      className="relative flex w-6 shrink-0 justify-center"
    >
      {children}
      {stop === "from" && (
        <span className="absolute top-full left-1/2 flex -translate-x-1/2 flex-col gap-0.5 pt-1">
          <i className="size-[3px] rounded-full bg-muted-foreground" />
          <i className="size-[3px] rounded-full bg-muted-foreground" />
          <i className="size-[3px] rounded-full bg-muted-foreground" />
        </span>
      )}
    </span>
  );
}

/**
 * The top card's shape (SPEC-web-app v1.13). Layout only: the boxes and buttons come in
 * as slots. The From box keeps its place in the tree in both shapes, so going from one
 * bar to two moves it without remounting it (rule 9).
 */
export function TripCard({
  twoBars,
  from,
  to,
  swap,
  saved,
  addDestination,
  saveDestination,
}: {
  twoBars: boolean;
  from: ReactNode;
  to: ReactNode;
  swap: ReactNode;
  saved: ReactNode;
  addDestination: ReactNode;
  saveDestination: ReactNode;
}) {
  return (
    // a landscape phone has no height for a third row, so it goes beside the boxes
    <div className="flex flex-col gap-2 max-md:[@media(max-height:479px)]:flex-row max-md:[@media(max-height:479px)]:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-1">
            {twoBars && (
              <RailStop stop="from">
                <Hero pose="idle" alt="" scale={1} />
              </RailStop>
            )}
            <div className="min-w-0 flex-1">{from}</div>
          </div>
          {twoBars && (
            <div className="flex items-center gap-1">
              <RailStop stop="to">
                <PixelSprite id="flag" sprite={ICONS.flag} alt="" scale={1} />
              </RailStop>
              <div className="min-w-0 flex-1">{to}</div>
            </div>
          )}
        </div>
        {twoBars ? swap : saved}
      </div>
      {twoBars && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">{addDestination}</div>
          <div className="flex shrink-0 items-center gap-1">
            {saveDestination}
            {saved}
          </div>
        </div>
      )}
    </div>
  );
}

/** ⊕ under the boxes: opens an empty stop box, as Google's "Add destination" does. */
export function AddDestinationButton({
  ref,
  onClick,
}: {
  ref: Ref<HTMLButtonElement>;
  onClick: () => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      className="flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-blue-700 hover:bg-muted"
      onClick={onClick}
    >
      <Plus aria-hidden="true" className="size-4" /> Add destination
    </button>
  );
}
