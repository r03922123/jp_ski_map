"use client";

import { ArrowUpDown, Plus } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { Hero } from "@/components/HeroMarker";
import { PixelSprite } from "@/components/PixelSprite";
import { ICONS } from "@/lib/game/sprites";
import { cn } from "@/lib/utils";

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
  saveDestination,
  placeCard,
}: {
  twoBars: boolean;
  from: ReactNode;
  to: ReactNode;
  swap: ReactNode;
  saved: ReactNode;
  /** ☆ beside the To box (v1.18) */
  saveDestination: ReactNode;
  /** under the one bar once there is a start (v1.13 rule 2) */
  placeCard: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {/* v1.27: a 2 px gap, as Google's two rows sit together */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1">
            {twoBars && (
              <RailStop stop="from">
                <Hero pose="idle" alt="" scale={1} />
              </RailStop>
            )}
            <div className="min-w-0 flex-1">{from}</div>
            {/* v1.18: ★ keeps the place it has in the one-bar card */}
            {twoBars && <TrailingSlot>{saved}</TrailingSlot>}
          </div>
          {twoBars && (
            <div className="flex items-center gap-1">
              <RailStop stop="to">
                <PixelSprite id="flag" sprite={ICONS.flag} alt="" scale={1} />
              </RailStop>
              <div className="min-w-0 flex-1">{to}</div>
              <TrailingSlot>{saveDestination}</TrailingSlot>
            </div>
          )}
        </div>
        {twoBars ? swap : saved}
      </div>
      {!twoBars && placeCard}
    </div>
  );
}

/** One width for ★ and ☆ beside the boxes, so From and To come out the same length. */
function TrailingSlot({ children }: { children: ReactNode }) {
  return <div className="flex w-11 shrink-0 justify-center">{children}</div>;
}

/** ⊕ above the sheet's Trip list (v1.18): opens an empty stop box, as Google's "Add stop" does. */
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

/** ⇅ beside the boxes: back to the lodging in one tap (SPEC-web-app v1.10). */
export function SwapButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Swap start and destination"
      disabled={disabled}
      className="flex size-11 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-muted disabled:opacity-40"
      onClick={onClick}
    >
      <ArrowUpDown aria-hidden="true" className="size-4" />
    </button>
  );
}

/** ★ Saved: opens the Saved panel in place of the trip lists, and closes it again. */
export function SavedButton({
  open,
  compact = false,
  onClick,
}: {
  open: boolean;
  /** icon only, in the two-row card's 44 px slot (v1.18) */
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Saved places"
      aria-pressed={open}
      className={cn(
        "flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full border bg-background text-xs font-medium shadow-sm hover:bg-muted aria-pressed:bg-amber-50",
        compact ? "w-11" : "px-3",
      )}
      onClick={onClick}
    >
      <span aria-hidden="true" className="text-amber-500">
        ★
      </span>
      <span className={compact ? "sr-only" : "max-md:sr-only"}>Saved</span>
    </button>
  );
}
