"use client";

import { useState } from "react";
import { ManeuverIcon } from "@/components/ManeuverIcon";
import type { Route } from "@/lib/api";
import { formatArrival, formatDistance, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

export type DirectionsPanelProps = {
  /** Primary first, then alternates (as drawn on the map). */
  routes: Route[];
  activeRoute: number;
  onSelectRoute: (index: number) => void;
  /** Shape range of the hovered/focused step, or null when none. */
  onHighlightStep: (range: [number, number] | null) => void;
  departAt: Date;
};

const LONG_WALK_S = 45 * 60;
const COLLAPSED_STEPS = 5;

/** Google-Maps-style directions: headline, route options, turn-by-turn steps. */
export function DirectionsPanel({
  routes,
  activeRoute,
  onSelectRoute,
  onHighlightStep,
  departAt,
}: DirectionsPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const route = routes[activeRoute] ?? routes[0];
  if (!route) return null;
  const steps = showAll ? route.steps : route.steps.slice(0, COLLAPSED_STEPS);

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-lg font-semibold">
          ETA ~ {formatDuration(route.durationS)} ·{" "}
          {formatDistance(route.distanceM)}
        </p>
        {route.summary && (
          <p className="text-sm text-muted-foreground">{route.summary}</p>
        )}
        <p className="text-sm">
          Arrive ~ {formatArrival(departAt, route.durationS)}
        </p>
        <p className="text-xs text-muted-foreground">
          Typical road speeds, no live traffic or snow. Expect longer in winter.
        </p>
      </div>

      {route.mode === "walk" && route.durationS > LONG_WALK_S && (
        <p className="text-sm text-amber-700">
          That's a long walk — consider the bus or driving.
        </p>
      )}

      {routes.length > 1 && (
        <div
          role="radiogroup"
          aria-label="Route options"
          className="flex flex-col gap-1"
        >
          {routes.map((r, i) => (
            <label
              key={`${r.durationS}-${r.distanceM}-${i}`}
              className={cn(
                "flex cursor-pointer items-baseline justify-between rounded-md border px-3 py-2 text-sm has-[:focus-visible]:ring-2",
                i === activeRoute
                  ? "border-blue-600 bg-blue-50"
                  : "hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="route-option"
                className="sr-only"
                checked={i === activeRoute}
                onChange={() => onSelectRoute(i)}
              />
              <span>
                <span className="font-medium">
                  {formatDuration(r.durationS)}
                </span>
                {" · "}
                {formatDistance(r.distanceM)}
              </span>
              {r.summary && (
                <span className="text-xs text-muted-foreground">
                  {r.summary}
                </span>
              )}
            </label>
          ))}
        </div>
      )}

      <ol aria-label="Steps" className="flex flex-col divide-y text-sm">
        {steps.map((s, i) => (
          // steps have no id and never reorder
          // biome-ignore lint/suspicious/noArrayIndexKey: static list
          <li key={i}>
            <button
              type="button"
              className="flex w-full items-center gap-3 py-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted"
              onMouseEnter={() => onHighlightStep(s.shapeRange)}
              onMouseLeave={() => onHighlightStep(null)}
              onFocus={() => onHighlightStep(s.shapeRange)}
              onBlur={() => onHighlightStep(null)}
            >
              <ManeuverIcon maneuver={s.maneuver} />
              <span className="flex-1">{s.instruction}</span>
              {s.distanceM > 0 && (
                <span className="text-xs text-muted-foreground">
                  {formatDistance(s.distanceM)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>
      {!showAll && route.steps.length > COLLAPSED_STEPS && (
        <button
          type="button"
          className="self-start text-sm text-muted-foreground underline"
          onClick={() => setShowAll(true)}
        >
          Show all {route.steps.length} steps
        </button>
      )}
    </div>
  );
}
