"use client";

import type { ReactNode } from "react";
import { MapCard } from "@/components/MapCard";
import { liftsText, type ResortSummary } from "@/lib/ski-stats";

/**
 * A resort as OpenSkiMap's ski-area panel shows it (SPEC-ski-runs v1.4): its vertical,
 * downhill km split by difficulty and lifts by type, all summed from the resort's lines
 * in the snapshot, so the card matches what the map draws.
 */
export function ResortCard({
  name,
  website,
  summary,
  failed,
  onClose,
}: {
  name: { en: string; ja: string };
  website: string;
  /** null until the lines have loaded */
  summary: ResortSummary | null;
  /** the lines could not be loaded */
  failed: boolean;
  onClose: () => void;
}) {
  const host = new URL(website).hostname.replace(/^www\./, "");
  return (
    <MapCard title={name.en} subtitle={name.ja} onClose={onClose}>
      {summary ? (
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
          {summary.verticalM !== null && (
            <Row label="Vertical">
              {`${summary.verticalM} m (${summary.lowM}–${summary.highM} m)`}
            </Row>
          )}
          <Row label="Downhill runs">
            {`${summary.totalRunKm.toFixed(1)} km`}
            <span
              aria-hidden="true"
              className="mt-1 mb-0.5 flex h-2 overflow-hidden rounded-full"
            >
              {summary.runKmByColour.map((b) => (
                <span
                  key={b.label}
                  style={{
                    width: `${(b.km / summary.totalRunKm) * 100}%`,
                    background: b.colour,
                  }}
                />
              ))}
            </span>
            <span className="sr-only">
              {summary.runKmByColour
                .map((b) => `${b.label} ${b.km.toFixed(1)} km`)
                .join(", ")}
            </span>
          </Row>
          {summary.liftsByType.length > 0 && (
            <Row label="Lifts">{liftsText(summary.liftsByType)}</Row>
          )}
        </dl>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">
          {failed
            ? "Couldn't load the runs and lifts."
            : "Loading runs and lifts…"}
        </p>
      )}
      <p className="m-0 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted-foreground">
        <a
          href={website}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary underline underline-offset-2"
        >
          {host}
        </a>
        {summary && <span>Measured from OpenSkiMap's runs and lifts</span>}
      </p>
    </MapCard>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 flex flex-col tabular-nums">{children}</dd>
    </div>
  );
}
