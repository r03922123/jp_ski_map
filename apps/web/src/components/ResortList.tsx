"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { CheckInButton } from "@/components/CheckInButton";
import { PixelSprite } from "@/components/PixelSprite";
import { type RankedResort, resortsQuery } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { useRider } from "@/lib/game/rider";
import { worldBadge } from "@/lib/game/sprites";
import { worldNumbers } from "@/lib/game/worlds";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

type Factors = RankedResort["factors"];

const FACTOR_ROWS: {
  key: keyof Factors;
  label: string;
  format: (v: number) => string;
}[] = [
  // Only the resort sizes: walk time is in the card's header
  { key: "runs", label: "Total runs", format: (v) => `${v}` },
  { key: "area", label: "Skiable area", format: (v) => `${v} ha` },
  {
    key: "runLength",
    label: "Run length",
    // whole hundreds of metres first: (20450 / 1000).toFixed(1) is "20.4"
    format: (v) => `${(Math.round(v / 100) / 10).toFixed(1)} km`,
  },
];

const asOfFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tokyo",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatAsOf(iso: string): string {
  const parts = Object.fromEntries(
    asOfFormat.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

// A report normally carries the current hour. Past this age the card says when it is from:
// the API serves its last good report while Open-Meteo is down, and a list left open ages.
const SNOW_OLD_MS = 90 * 60 * 1000;

// Only http(s) URLs become links; any other text, e.g. "javascript:…", stays plain
// A URL never ends in . : or ' here: that's the sentence around it
const WEB_URL = /(https?:\/\/[^\s;,()]*[^\s;,().:'])/;

function SourceLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all underline"
    >
      {href}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function linkify(text: string) {
  return text.split(WEB_URL).map((part, i) =>
    // biome-ignore lint/suspicious/noArrayIndexKey: the same URL can appear twice; parts never reorder
    i % 2 ? <SourceLink key={part + i} href={part} /> : part,
  );
}

function DataSources({ r }: { r: RankedResort }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-muted-foreground">
        Sources
      </summary>
      <dl className="mt-1 space-y-1 text-muted-foreground">
        <dt className="font-medium">Walk time</dt>
        <dd>
          OpenStreetMap roads, Valhalla router:{" "}
          <SourceLink href="https://www.openstreetmap.org/copyright" />
        </dd>
        <dt className="font-medium">Fresh snow, snow depth</dt>
        <dd>
          {r.snow?.depthCm.source === "reported"
            ? "Reported by the resort; forecast from Open-Meteo"
            : "Open-Meteo model"}
          {r.snow && `, as of ${formatAsOf(r.snow.asOf)}`}:{" "}
          <SourceLink href="https://open-meteo.com/" />
        </dd>
        <dt className="font-medium">Resort stats</dt>
        <dd>{linkify(r.statsSource)}</dd>
        <dt className="font-medium">Resort website</dt>
        <dd>{linkify(r.website)}</dd>
      </dl>
    </details>
  );
}

function snowSummary(r: RankedResort): string | null {
  const fresh = r.snow?.newSnowCm.past24h;
  const depth = r.snow?.depthCm.summit;
  const bits = [
    fresh != null ? `${Math.round(fresh)} cm new` : null,
    depth != null ? `${depth} cm summit` : null,
  ].filter(Boolean);
  return bits.length ? `❄ ${bits.join(" · ")}` : null;
}

export function ResortList({
  resorts,
  selectedId,
  onSelect,
  scrollKey,
  fetching = false,
}: {
  resorts: RankedResort[];
  selectedId: string | null;
  onSelect: (resortId: string, accessPointId: string) => void;
  /** the user's sort and filters: a new order that follows a change here is brought to the selection */
  scrollKey?: string;
  /** the ranking is being fetched (for new options, the list still shows the old one) */
  fetching?: boolean;
}) {
  // SPEC-web-app v1.6 level select: each card is a world, numbered by geography
  const catalog = useQuery(resortsQuery);
  const worlds = worldNumbers(catalog.data ?? []);
  const rider = useRider();
  const now = useNow(60_000);
  // T3: a re-sort or a new filter must not hide the selection: once the ranking for the user's
  // new options has loaded, the selected row comes into view. Only then: a new start reorders
  // the list too, and a scroll there could push the sheet's Start out of view; and a re-sort
  // that kept the order must not leave a scroll waiting (reviews of #116)
  const listRef = useRef<HTMLOListElement>(null);
  const lastKey = useRef(scrollKey);
  const [pending, setPending] = useState(false);
  if (scrollKey !== lastKey.current) {
    lastKey.current = scrollKey;
    setPending(true);
  }
  useEffect(() => {
    if (!pending || fetching) return;
    setPending(false);
    listRef.current
      ?.querySelector<HTMLElement>('button[aria-pressed="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [pending, fetching]);
  return (
    <ol
      ref={listRef}
      aria-label="Ranked resorts"
      className="flex flex-col divide-y"
    >
      {resorts.map((r) => {
        const snow = snowSummary(r);
        const snowIsOld =
          r.snow != null &&
          now.getTime() - Date.parse(r.snow.asOf) > SNOW_OLD_MS;
        return (
          <li key={r.resortId} className="py-2">
            <button
              type="button"
              aria-pressed={r.resortId === selectedId}
              onClick={() => onSelect(r.resortId, r.accessPointId)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg p-2 text-left hover:bg-muted",
                r.resortId === selectedId &&
                  "bg-accent ring-1 ring-primary hover:bg-accent",
              )}
            >
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {r.rank}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">{r.name}</span>
                {catalog.data?.find((c) => c.id === r.resortId)?.name.ja && (
                  <span lang="ja" className="truncate text-xs">
                    {catalog.data.find((c) => c.id === r.resortId)?.name.ja}
                  </span>
                )}
                {worlds.has(r.resortId) && (
                  <span
                    data-world={worlds.get(r.resortId)}
                    className="flex items-center gap-1 text-xs"
                  >
                    <PixelSprite
                      id={`world-${worlds.get(r.resortId)}`}
                      sprite={worldBadge(worlds.get(r.resortId) ?? 0)}
                      scale={1}
                      alt=""
                    />
                    World {worlds.get(r.resortId)} ·{" "}
                    {rider.stamps[r.resortId] ? "★ stamped" : "☆ not yet"}
                  </span>
                )}
                {snow && (
                  <span className="text-xs text-muted-foreground">{snow}</span>
                )}
                {snow && snowIsOld && r.snow && (
                  <span className="text-xs text-muted-foreground">
                    Snow as of {formatAsOf(r.snow.asOf)}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-sm font-semibold">
                {r.walkS != null ? `~ ${formatDuration(r.walkS)}` : "no route"}
              </span>
            </button>
            <details className="px-2 pl-11 text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Details
              </summary>
              <div className="mt-1">
                <CheckInButton resortId={r.resortId} />
              </div>
              <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
                {FACTOR_ROWS.map(({ key, label, format }) => {
                  const value = r.factors[key];
                  return [
                    <dt key={`${key}-dt`}>{label}</dt>,
                    <dd key={`${key}-dd`} className="text-right tabular-nums">
                      {value != null ? format(value) : "—"}
                    </dd>,
                  ];
                })}
              </dl>
              <DataSources r={r} />
            </details>
          </li>
        );
      })}
    </ol>
  );
}
