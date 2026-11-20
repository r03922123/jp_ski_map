"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
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
  {
    key: "driveTime",
    label: "Drive time",
    format: (v) => `~ ${formatDuration(v)}`,
  },
  {
    key: "freshSnow",
    label: "Fresh snow (24 h + ½ next 24 h)",
    format: (v) => `${v} cm`,
  },
  { key: "snowDepth", label: "Summit snow depth", format: (v) => `${v} cm` },
  {
    key: "crowd",
    label: "Crowd score (est.)",
    format: (v) => `${Math.round(v * 100)}%`,
  },
  { key: "terrainSize", label: "Runs", format: (v) => `${v}` },
  { key: "vertical", label: "Vertical drop", format: (v) => `${v} m` },
  {
    key: "price",
    label: "Ticket price",
    format: (v) => `¥${v.toLocaleString("en-US")}`,
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

const signed = (w: number) => `${w < 0 ? "−" : "+"}${Math.abs(w).toFixed(2)}`;

function SourcesAndWeights({ r }: { r: RankedResort }) {
  const sum = r.crowd?.contributions.reduce((s, c) => s + c.weight, 0) ?? 0;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-muted-foreground">
        Sources &amp; weights
      </summary>
      <dl className="mt-1 space-y-1 text-muted-foreground">
        <dt className="font-medium">Drive time</dt>
        <dd>
          OpenStreetMap roads, Valhalla router:{" "}
          <SourceLink href="https://www.openstreetmap.org/copyright" />
        </dd>
        <dt className="font-medium">Fresh snow, snow depth</dt>
        <dd>
          {r.snow?.depthCm.source === "reported"
            ? "Reported by the resort; forecast from Open-Meteo"
            : "Open-Meteo model"}
          : <SourceLink href="https://open-meteo.com/" />
        </dd>
        {r.crowd && (
          <>
            <dt className="font-medium">Crowd (heuristic estimate)</dt>
            <dd>
              <ul>
                {r.crowd.contributions.map((c) => (
                  <li key={c.label} className="flex justify-between gap-3">
                    <span>{c.label}</span>
                    <span className="tabular-nums">{signed(c.weight)}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-3 font-medium">
                  <span>Sum</span>
                  <span className="tabular-nums">{sum.toFixed(2)}</span>
                </li>
              </ul>
              {(sum < 0 || sum > 1) && <p>The sum is capped to 0–1.</p>}
              <p>Levels: below 0.30 low, below 0.55 medium, below 0.80 high.</p>
            </dd>
          </>
        )}
        <dt className="font-medium">Runs, vertical drop, ticket price</dt>
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
}: {
  resorts: RankedResort[];
  selectedId: string | null;
  onSelect: (resortId: string, accessPointId: string) => void;
}) {
  // SPEC-web-app v1.6 level select: each card is a world, numbered by geography
  const catalog = useQuery(resortsQuery);
  const worlds = worldNumbers(catalog.data ?? []);
  const rider = useRider();
  const now = useNow(60_000);
  // T3: a new order (sort, date, category) must not hide the selection. Only on a change of
  // order: not on mount, and not when the user just tapped a row
  const listRef = useRef<HTMLOListElement>(null);
  const order = resorts.map((r) => r.resortId).join();
  const lastOrder = useRef(order);
  useEffect(() => {
    if (order === lastOrder.current) return;
    lastOrder.current = order;
    listRef.current
      ?.querySelector<HTMLElement>('button[aria-pressed="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [order]);
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
                {r.crowd && (
                  <span className="text-xs text-muted-foreground">
                    Crowd: {r.crowd.level.replace("_", " ")} (est.)
                  </span>
                )}
              </span>
              <span className="shrink-0 text-sm font-semibold">
                {r.driveS != null
                  ? `~ ${formatDuration(r.driveS)}`
                  : "no route"}
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
              {r.crowd && r.crowd.reasons.length > 0 && (
                <p className="mt-1 text-muted-foreground">
                  Crowd estimate: {r.crowd.reasons.join(" · ")}
                </p>
              )}
              {r.snow && (
                <p className="mt-1 text-muted-foreground">
                  Snow model as of {formatAsOf(r.snow.asOf)} (Open-Meteo)
                </p>
              )}
              <SourcesAndWeights r={r} />
            </details>
          </li>
        );
      })}
    </ol>
  );
}
