"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckInButton } from "@/components/CheckInButton";
import { PixelSprite } from "@/components/PixelSprite";
import { fetchResorts, type RankedResort } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { useRider } from "@/lib/game/rider";
import { worldBadge } from "@/lib/game/sprites";
import { worldNumbers } from "@/lib/game/worlds";
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
  const catalog = useQuery({ queryKey: ["resorts"], queryFn: fetchResorts });
  const worlds = worldNumbers(catalog.data ?? []);
  const rider = useRider();
  return (
    <ol aria-label="Ranked resorts" className="flex flex-col divide-y">
      {resorts.map((r) => {
        const snow = snowSummary(r);
        return (
          <li key={r.resortId} className="py-2">
            <button
              type="button"
              aria-pressed={r.resortId === selectedId}
              onClick={() => onSelect(r.resortId, r.accessPointId)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg p-2 text-left hover:bg-muted",
                r.resortId === selectedId && "bg-muted",
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
            </details>
          </li>
        );
      })}
    </ol>
  );
}
