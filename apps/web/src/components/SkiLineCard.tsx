"use client";

import { MapCard } from "@/components/MapCard";
import {
  LIFT_COLOR,
  runColor,
  type SkiLine,
} from "@/components/map/SkiLinesLayer";

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Intermediate run", "Chair lift": OpenSkiMap's words, as the map's colours show them. */
function kindLabel(line: SkiLine) {
  if (line.kind === "lift")
    return line.liftType ? capital(line.liftType.replaceAll("_", " ")) : "Lift";
  return line.difficulty
    ? `${capital(line.difficulty)} run`
    : "Run, difficulty unknown";
}

/**
 * What a tapped run or lift is (SPEC-ski-runs v1.1). OpenSkiMap joins a name's languages
 * with ", " (Japanese first), so the first is the title and the rest sit under it.
 */
export function SkiLineCard({
  line,
  resortName,
  onClose,
}: {
  line: SkiLine;
  resortName: string;
  onClose: () => void;
}) {
  const [title, ...others] = line.name?.split(", ") ?? [];
  const colour = line.kind === "lift" ? LIFT_COLOR : runColor(line.difficulty);
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
        {`${kindLabel(line)} · ${resortName}`}
      </p>
    </MapCard>
  );
}
