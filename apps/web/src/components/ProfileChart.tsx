"use client";

import { type PointerEvent, useState } from "react";
import type { SkiProfile } from "@/components/map/SkiLinesLayer";
import type { Coord } from "@/lib/api";
import { type LngLat, pointAlong } from "@/lib/route-geo";
import { profileStats, slopeColour, slopeText } from "@/lib/ski-stats";

const STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageUp: 10,
  PageDown: -10,
};
const km = (m: number) => (m / 1000).toFixed(2);

/**
 * A run's height against distance, coloured by slope as OpenSkiMap's run panel draws it
 * (SPEC-ski-runs v1.4). A mouse over it, a finger dragged along it or the arrow keys pick
 * a point: the readout gives its height and slope, and `onPoint` its place on the map.
 */
export function ProfileChart({
  profile,
  line,
  onPoint,
}: {
  profile: SkiProfile;
  /** the whole run, which the profile follows from its first point to its last */
  line: LngLat[];
  onPoint?: (at: Coord | null) => void;
}) {
  const { heightsM: h, resolutionM } = profile;
  const { slopesPct } = profileStats(profile);
  const last = h.length - 1;
  const top = Math.max(...h);
  const span = Math.max(top - Math.min(...h), 1);
  const [at, setAt] = useState<number | null>(null);
  const show = (i: number | null) => {
    if (i === at) return; // a move inside the same 25 m redraws nothing
    setAt(i);
    const p = i === null ? null : pointAlong(line, i / last);
    onPoint?.(p && { lng: p[0], lat: p[1] });
  };
  const fromPointer = (e: PointerEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return;
    const f = Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1);
    show(Math.round(f * last));
  };
  // the slope of the stretch ahead; the last point has only the one behind it
  const readout = (i: number) =>
    `${h[i]} m · ${slopeText(slopesPct[Math.min(i, last - 1)])}`;
  const shown = at ?? 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[auto_1fr] gap-x-1.5 gap-y-0.5 text-[11px] leading-none text-muted-foreground tabular-nums">
        <div className="flex flex-col justify-between text-right">
          <span>{top} m</span>
          <span>{top - span} m</span>
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Height profile"
          aria-valuemin={0}
          aria-valuemax={Math.round(last * resolutionM)}
          aria-valuenow={Math.round(shown * resolutionM)}
          aria-valuetext={`${readout(shown)}, ${km(shown * resolutionM)} km along`}
          // a finger dragged along the chart moves the point, not the page
          className="relative h-20 cursor-crosshair touch-none rounded-sm bg-muted/50 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
          onPointerDown={fromPointer}
          onPointerMove={fromPointer}
          onPointerLeave={() => show(null)}
          onPointerCancel={() => show(null)}
          onBlur={() => show(null)}
          onKeyDown={(e) => {
            const i =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? last
                  : e.key in STEP
                    ? Math.min(Math.max(shown + STEP[e.key], 0), last)
                    : null;
            if (i === null) return;
            e.preventDefault();
            show(i);
          }}
        >
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${last} ${span}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
          >
            {slopesPct.map((pct, k) => (
              <polygon
                // biome-ignore lint/suspicious/noArrayIndexKey: a stretch is its place along the run; the list never reorders
                key={k}
                points={`${k},${top - h[k]} ${k + 1},${top - h[k + 1]} ${k + 1},${span} ${k},${span}`}
                fill={slopeColour(pct)}
                // the same colour round each stretch closes the hairline gaps between them
                stroke={slopeColour(pct)}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {at !== null && (
              <line
                x1={at}
                x2={at}
                y1={0}
                y2={span}
                className="stroke-foreground"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {at !== null && (
            <span
              className="pointer-events-none absolute size-3 -translate-1/2 rounded-full border-2 border-white bg-foreground shadow"
              style={{
                left: `${(at / last) * 100}%`,
                top: `${((top - h[at]) / span) * 100}%`,
              }}
            />
          )}
        </div>
        <span />
        <div className="flex justify-between">
          <span>0 km</span>
          <span>{km(last * resolutionM)} km</span>
        </div>
      </div>
      <p className="m-0 min-h-5 text-sm tabular-nums">
        {at !== null ? (
          readout(at)
        ) : (
          <span className="text-muted-foreground">
            Move along the profile to find the spot on the map
          </span>
        )}
      </p>
    </div>
  );
}
