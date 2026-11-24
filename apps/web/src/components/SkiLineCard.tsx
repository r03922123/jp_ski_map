"use client";

import { MapCard } from "@/components/MapCard";
import {
  LIFT_COLOR,
  runColor,
  type SkiLine,
  type SkiLineFeature,
} from "@/components/map/SkiLinesLayer";
import { ProfileChart } from "@/components/ProfileChart";
import type { Coord } from "@/lib/api";
import { liftName, profileRows, profileStats, skiStats } from "@/lib/ski-stats";

/** "Intermediate run", "Chair lift": OpenSkiMap's words, as the map's colours show them. */
function kindLabel(line: SkiLine) {
  if (line.kind === "lift")
    return line.liftType ? liftName(line.liftType) : "Lift";
  return line.difficulty
    ? `${line.difficulty.charAt(0).toUpperCase()}${line.difficulty.slice(1)} run`
    : "Run, difficulty unknown";
}

/**
 * What a tapped run or lift is (SPEC-ski-runs v1.1). OpenSkiMap joins a name's languages
 * with ", " (Japanese first), so the first is the title and the rest sit under it. Its
 * numbers follow, as OpenSkiMap shows them (v1.2). Once the whole line has loaded, a run
 * also gets its height profile (v1.4); until then, or if it never comes, the card shows
 * the tapped feature's numbers alone.
 */
export function SkiLineCard({
  line,
  full,
  resortName,
  onResort,
  onClose,
  onPoint,
}: {
  line: SkiLine;
  /** the whole line, from the `/api/ski-lines` query */
  full?: SkiLineFeature;
  resortName: string;
  /** the resort name opens its card */
  onResort: () => void;
  onClose: () => void;
  /** the point picked on the height profile, or null when none is */
  onPoint?: (at: Coord | null) => void;
}) {
  const [title, ...others] = line.name?.split(", ") ?? [];
  const colour = line.kind === "lift" ? LIFT_COLOR : runColor(line.difficulty);
  const run =
    full?.geometry.type === "LineString" && full.properties.profile
      ? { profile: full.properties.profile, coords: full.geometry.coordinates }
      : null;
  const stats = [
    ...skiStats(line),
    ...(run ? profileRows(profileStats(run.profile)) : []),
  ];
  return (
    <MapCard
      title={title || `Unnamed ${line.kind}`}
      subtitle={others.length > 0 && others.join(", ")}
      onClose={onClose}
    >
      <p className="m-0 flex items-center gap-2 text-sm">
        <span
          aria-hidden="true"
          className="h-1.5 w-5 shrink-0 rounded-full"
          style={{ background: colour }}
        />
        <span>
          {`${kindLabel(line)} · `}
          <button
            type="button"
            onClick={onResort}
            className="underline decoration-muted-foreground/60 underline-offset-2 hover:decoration-current"
          >
            {resortName}
          </button>
        </span>
      </p>
      {stats.length > 0 && (
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
          {stats.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="m-0 tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {run && (
        <ProfileChart
          profile={run.profile}
          line={run.coords}
          onPoint={onPoint}
        />
      )}
    </MapCard>
  );
}
