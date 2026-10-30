"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type StopRow = { stopId: string; name: string; time: string | null };

/**
 * Every stop the shuttle passes, boarding to getting off (SPEC-pilot "Bus stops").
 * With `nextIndex` (riding) the earlier stops are marked passed and the next one is
 * current and kept in view.
 */
export function StopList({
  stops,
  nextIndex = null,
  className,
}: {
  stops: StopRow[];
  nextIndex?: number | null;
  className?: string;
}) {
  const nextRef = useRef<HTMLLIElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the next stop changes
  useEffect(() => {
    nextRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [nextIndex]);
  const last = stops.length - 1;
  return (
    <ol
      aria-label="Bus stops"
      className={cn("flex flex-col text-xs", className)}
    >
      {stops.map((s, i) => {
        const state =
          nextIndex === null
            ? "upcoming"
            : i < nextIndex
              ? "passed"
              : i === nextIndex
                ? "next"
                : "upcoming";
        return (
          <li
            key={`${s.stopId}-${i}`}
            ref={state === "next" ? nextRef : undefined}
            data-state={state}
            aria-current={state === "next" ? "step" : undefined}
            className={cn(
              "flex items-baseline justify-between gap-2 rounded px-1 py-0.5",
              state === "passed" && "text-muted-foreground line-through",
              state === "next" && "bg-teal-50 font-medium text-teal-900",
            )}
          >
            <span
              data-stop-name
              className={cn((i === 0 || i === last) && "font-semibold")}
            >
              {s.name}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {s.time ?? "time not published"}
            </span>
            {state === "passed" && <span className="sr-only"> (passed)</span>}
          </li>
        );
      })}
    </ol>
  );
}
