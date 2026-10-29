"use client";

import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Mode, Resort, Route } from "@/lib/api";
import { formatDistance, formatDuration } from "@/lib/format";

export type PanelMode = Mode | "bus";

export type RouteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; data: Route };

export type ModePanelProps = {
  mode: PanelMode;
  onModeChange: (mode: PanelMode) => void;
  resorts: Resort[];
  selectedResortId: string | null;
  onSelectResort: (id: string) => void;
  hasOrigin: boolean;
  route: RouteState;
  /** Drive mode: ranked resort list replacing the plain picker. */
  drivePanel?: ReactNode;
  /** Bus mode: shuttle options; the route shown is the walk to the chosen stop. */
  busPanel?: ReactNode;
};

const LONG_WALK_S = 45 * 60;

const ERROR_TEXT: Record<string, string> = {
  no_route:
    "No route found between these points. Try a point closer to a road.",
  routing_unavailable:
    "Routing is unavailable right now. Please try again shortly.",
};

export function ModePanel({
  mode,
  onModeChange,
  resorts,
  selectedResortId,
  onSelectResort,
  hasOrigin,
  route,
  drivePanel,
  busPanel,
}: ModePanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <Tabs
        value={mode}
        onValueChange={(value) => onModeChange(value as PanelMode)}
      >
        <TabsList className="w-full">
          <TabsTrigger value="bus" disabled={!busPanel}>
            🚌 Bus
          </TabsTrigger>
          <TabsTrigger value="drive">🚗 Drive</TabsTrigger>
          <TabsTrigger value="walk">🚶 Walk</TabsTrigger>
        </TabsList>
      </Tabs>

      {!hasOrigin ? (
        <p className="text-sm text-muted-foreground">
          Tap the map to set your starting point.
        </p>
      ) : mode === "bus" && busPanel ? (
        <>
          {busPanel}
          <RouteSummary mode="walk" route={route} />
        </>
      ) : mode === "drive" && drivePanel ? (
        <>
          <RouteSummary mode={mode} route={route} />
          {drivePanel}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1 text-sm font-medium">
            <label htmlFor="resort-picker">Resort</label>
            <select
              id="resort-picker"
              className="rounded-md border bg-background px-2 py-1.5 font-normal"
              value={selectedResortId ?? ""}
              onChange={(e) => onSelectResort(e.target.value)}
            >
              <option value="" disabled>
                Choose a resort…
              </option>
              {resorts.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name.en}
                </option>
              ))}
            </select>
          </div>
          <RouteSummary mode={mode} route={route} />
        </>
      )}
    </div>
  );
}

function RouteSummary({ mode, route }: { mode: PanelMode; route: RouteState }) {
  if (route.status === "idle") return null;
  if (route.status === "loading") {
    return <p className="text-sm text-muted-foreground">Finding route…</p>;
  }
  if (route.status === "error") {
    return (
      <p role="alert" className="text-sm text-destructive">
        {ERROR_TEXT[route.error] ?? "Something went wrong loading the route."}
      </p>
    );
  }
  const { durationS, distanceM, steps } = route.data;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-lg font-semibold">
        ETA ~ {formatDuration(durationS)} · {formatDistance(distanceM)}
      </p>
      {mode === "walk" && durationS > LONG_WALK_S && (
        <p className="text-sm text-amber-700">
          That's a long walk — consider the bus or driving.
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-sm text-muted-foreground">
          {steps.length} steps
        </summary>
        <ol className="mt-2 flex max-h-60 flex-col gap-1 overflow-y-auto text-sm">
          {steps.map((s, i) => (
            // steps have no id and never reorder
            // biome-ignore lint/suspicious/noArrayIndexKey: static list
            <li key={i}>{s.instruction}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}
