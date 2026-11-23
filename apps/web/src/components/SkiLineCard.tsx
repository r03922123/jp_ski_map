"use client";

import { useEffect } from "react";
import { runColor } from "@/components/map/SkiLinesLayer";
import { formatDistance } from "@/lib/format";

/** A feature's properties in /api/ski-lines (SPEC-ski-runs "Data" and v2). */
export type SkiLine = {
  id: string;
  kind: "run" | "lift";
  name: string | null;
  difficulty: string | null;
  liftType: string | null;
  resortId: string;
  lengthM: number | null;
  minEleM: number | null;
  maxEleM: number | null;
};

/**
 * A tapped feature's properties as a SkiLine. MapLibre drops null properties from tiled
 * GeoJSON, so a missing key is turned back into null here.
 */
export function skiLineFrom(p: Record<string, unknown>): SkiLine {
  const text = (k: string) =>
    typeof p[k] === "string" ? (p[k] as string) : null;
  const metres = (k: string) =>
    typeof p[k] === "number" ? (p[k] as number) : null;
  return {
    id: String(p.id),
    kind: p.kind === "lift" ? "lift" : "run",
    name: text("name"),
    difficulty: text("difficulty"),
    liftType: text("liftType"),
    resortId: String(p.resortId),
    lengthM: metres("lengthM"),
    minEleM: metres("minEleM"),
    maxEleM: metres("maxEleM"),
  };
}

const LIFT_LABELS: Record<string, string> = {
  cable_car: "Cable car",
  gondola: "Gondola",
  chair_lift: "Chairlift",
  mixed_lift: "Gondola and chairlift",
  drag_lift: "Drag lift",
  "t-bar": "T-bar",
  "j-bar": "J-bar",
  platter: "Platter lift",
  rope_tow: "Rope tow",
  magic_carpet: "Magic carpet",
  funicular: "Funicular",
  railway: "Railway",
};

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

/** The card's text: what the line is, and its distance, vertical and slope when known. */
export function skiLineFacts(line: SkiLine) {
  const what =
    line.kind === "lift"
      ? (line.liftType && LIFT_LABELS[line.liftType]) || "Lift"
      : line.difficulty
        ? `${capital(line.difficulty)} run`
        : "Run";
  const { lengthM: flat, minEleM: low, maxEleM: high } = line;
  const vertical = low !== null && high !== null ? high - low : null;
  const facts: string[] = [];
  // along the slope, as OpenSkiMap shows it; the snapshot's length is horizontal
  if (flat !== null)
    facts.push(`Distance ${formatDistance(Math.hypot(flat, vertical ?? 0))}`);
  if (vertical !== null)
    facts.push(`Vertical ${vertical} m (${low}–${high} m)`);
  if (flat && vertical !== null) {
    const degrees = Math.round((Math.atan(vertical / flat) * 180) / Math.PI);
    facts.push(`Slope ${degrees}° (${Math.round((vertical / flat) * 100)}%)`);
  }
  return { title: line.name ?? `Unnamed ${line.kind}`, what, facts };
}

/** The card on a tapped run or lift (SPEC-ski-runs v2): what it is, its resort, its numbers. */
export function SkiLineCard({
  line,
  resortName,
  onSelectResort,
  onClose,
}: {
  line: SkiLine;
  resortName: string;
  onSelectResort: () => void;
  onClose: () => void;
}) {
  const { title, what, facts } = skiLineFacts(line);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <section
      aria-label={title}
      className="surface relative flex flex-col gap-1 rounded-[12px] px-3 py-2 pr-9 text-sm"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute top-1 right-1 px-2"
      >
        ✕
      </button>
      <button
        type="button"
        onClick={onSelectResort}
        className="self-start text-left text-xs text-muted-foreground underline"
      >
        {resortName}
      </button>
      <h2 className="font-medium">{title}</h2>
      <p className="flex items-center gap-1.5">
        {line.kind === "run" && (
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-full"
            style={{ background: runColor(line.difficulty) }}
          />
        )}
        {what}
      </p>
      {facts.map((f) => (
        <p key={f} className="text-muted-foreground">
          {f}
        </p>
      ))}
    </section>
  );
}
