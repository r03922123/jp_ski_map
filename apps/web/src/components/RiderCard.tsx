"use client";

import { useQuery } from "@tanstack/react-query";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Hero } from "@/components/HeroMarker";
import { PixelSprite } from "@/components/PixelSprite";
import { QuestList } from "@/components/QuestLog";
import { fetchResorts, type Resort } from "@/lib/api";
import { useBackToClose } from "@/lib/back-close";
import {
  emptyRider,
  MAX_NAME,
  rename,
  riderStore,
  titleFor,
  useRider,
} from "@/lib/game/rider";
import {
  decodeRider,
  encodeRider,
  type RiderCardData,
  riderShareUrl,
} from "@/lib/game/rider-share";
import { worldBadge } from "@/lib/game/sprites";
import { worldNumbers } from "@/lib/game/worlds";

function useResorts(): Resort[] {
  return useQuery({ queryKey: ["resorts"], queryFn: fetchResorts }).data ?? [];
}

/** Name, title, the stamp grid (one slot per world, north to south) and stats. */
function CardBody({
  card,
  resorts,
}: {
  card: RiderCardData;
  resorts: Resort[];
}) {
  const worlds = worldNumbers(resorts);
  const ordered = [...resorts].sort(
    (a, b) => (worlds.get(a.id) ?? 0) - (worlds.get(b.id) ?? 0),
  );
  const count = ordered.filter((r) => card.stamps[r.id]).length;
  const { km, trips } = card.stats;
  return (
    <>
      <p className="text-lg">
        {titleFor(count, resorts.length)} · {count}/{resorts.length} stamps
      </p>
      <ol aria-label="Stamps" className="grid grid-cols-5 gap-2">
        {ordered.map((r) => {
          const n = worlds.get(r.id) ?? 0;
          const at = card.stamps[r.id];
          return (
            <li
              key={r.id}
              data-stamped={at ? "true" : "false"}
              className="flex justify-center"
            >
              <PixelSprite
                id={`world-${n}`}
                sprite={worldBadge(n)}
                scale={2}
                alt={`World ${n}, ${r.name.en}: ${at ? `stamped ${at}` : "not yet"}`}
                className={at ? "" : "opacity-30 grayscale"}
              />
            </li>
          );
        })}
      </ol>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-sm">
        <dt>Trips navigated</dt>
        <dd className="text-right tabular-nums">{trips}</dd>
        <dt>By bus</dt>
        <dd className="text-right tabular-nums">{km.bus.toFixed(1)} km</dd>
        <dt>By car</dt>
        <dd className="text-right tabular-nums">{km.drive.toFixed(1)} km</dd>
        <dt>On foot</dt>
        <dd className="text-right tabular-nums">{km.walk.toFixed(1)} km</dd>
      </dl>
    </>
  );
}

/** Tab and Shift+Tab wrap around inside a modal dialog. */
function trapTab(e: KeyboardEvent<HTMLElement>, root: HTMLElement | null) {
  const items = Array.from(
    root?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input, [href], select, textarea, [tabindex]:not([tabindex='-1'])",
    ) ?? [],
  );
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const at = document.activeElement;
  if (e.shiftKey && (at === first || at === root)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && at === last) {
    e.preventDefault();
    first.focus();
  }
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useBackToClose(true, onClose);
  // focus moves in, and back to whatever opened the dialog when it closes
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => opener?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 md:items-center">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="pixel-frame m-2 flex max-h-[85dvh] w-full max-w-sm flex-col gap-3 overflow-y-auto p-4 outline-none"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") trapTab(e, ref.current);
        }}
      >
        <div className="flex items-center gap-2">
          <Hero pose="idle" alt="" />
          <h2 id={titleId} className="flex-1 text-lg">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="border-2 border-[var(--ink)] bg-card px-2 shadow-[2px_2px_0_var(--ink)]"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const btn =
  "border-2 border-[var(--ink)] px-2 py-1 shadow-[2px_2px_0_var(--ink)] active:translate-y-0.5 active:shadow-none";

/** Your own card: rename, today's quests, share, reset (SPEC-progression). */
export function MyRiderCard({ onClose }: { onClose: () => void }) {
  const rider = useRider();
  const resorts = useResorts();
  const [link, setLink] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const card: RiderCardData = {
    name: rider.name,
    stamps: Object.fromEntries(
      Object.values(rider.stamps).map((s) => [s.resortId, s.firstAt]),
    ),
    stats: rider.stats,
  };
  const share = () => {
    const url = riderShareUrl(window.location.origin, encodeRider(rider));
    setLink(url);
    navigator.clipboard?.writeText(url).catch(() => {});
  };
  return (
    <Dialog title="Rider card" onClose={onClose}>
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          defaultValue={rider.name}
          maxLength={MAX_NAME}
          onBlur={(e) => riderStore.update((s) => rename(s, e.target.value))}
          className="border-2 border-[var(--ink)] bg-background px-2 py-1"
        />
      </label>
      <CardBody card={card} resorts={resorts} />
      <section aria-label="Today's quests" className="text-sm">
        <h3 className="mb-1">Today's quests</h3>
        <QuestList />
      </section>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={share}
          className={`${btn} bg-primary text-primary-foreground`}
        >
          Share card
        </button>
        {confirming ? (
          <>
            <span>Erase stamps, quests and stats on this device?</span>
            <button
              type="button"
              onClick={() => {
                riderStore.update((s) => ({ ...emptyRider(), name: s.name }));
                setConfirming(false);
              }}
              className={`${btn} bg-destructive text-white`}
            >
              Erase
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={`${btn} bg-card`}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={`${btn} bg-card`}
          >
            Reset progress
          </button>
        )}
      </div>
      {link && (
        <p className="text-xs">
          Link copied. Anyone with it sees your name, stats and the day each
          stamp was first earned (no other visits, no positions):
          <input
            readOnly
            aria-label="Rider card link"
            value={link}
            onFocus={(e) => e.target.select()}
            className="mt-1 w-full border bg-background px-1"
          />
        </p>
      )}
    </Dialog>
  );
}

/** Someone's card from a `#rider=` link: view only, nothing is imported. */
export function SharedRiderCard({
  code,
  onClose,
}: {
  code: string;
  onClose: () => void;
}) {
  const result = useMemo(() => decodeRider(code), [code]);
  const resorts = useResorts();
  return (
    <Dialog
      title={result.ok ? `${result.card.name}'s rider card` : "Rider card"}
      onClose={onClose}
    >
      {result.ok ? (
        <CardBody card={result.card} resorts={resorts} />
      ) : (
        <p>{result.error}</p>
      )}
    </Dialog>
  );
}

/** The HUD's rider: name, title and stamps; opens your rider card. */
export function RiderButton({ onOpen }: { onOpen: () => void }) {
  const rider = useRider();
  const worlds = useResorts().length;
  const stamps = Object.keys(rider.stamps).length;
  const title = titleFor(stamps, worlds);
  return (
    <button
      type="button"
      aria-label={`Rider card: ${rider.name}, ${title}, ${stamps} of ${worlds} stamps`}
      onClick={onOpen}
      className="flex min-w-0 items-center gap-1.5 border-2 border-[var(--ink)] bg-card py-0.5 pr-2 pl-0.5 text-xs shadow-[2px_2px_0_var(--ink)] active:translate-y-0.5 active:shadow-none"
    >
      <Hero pose="idle" alt="" scale={1} />
      <span className="flex min-w-0 flex-col items-start leading-tight">
        <span className="max-w-24 truncate">{rider.name}</span>
        <span className="text-muted-foreground">{title}</span>
      </span>
      <span aria-hidden="true" className="ml-1 tabular-nums">
        ★ {stamps}/{worlds}
      </span>
    </button>
  );
}
