import { MAX_NAME, type RiderState } from "@/lib/game/rider";
import { fromBase64url, toBase64url } from "@/lib/saved-share";

/**
 * Share a rider card as a link: `/#rider=<base64url JSON>` (SPEC-progression). Like
 * saved-list links it rides in the URL fragment, so it never reaches a server. The
 * receiver only views it; nothing is imported. Only the day each stamp was first earned
 * travels: never later visits, never positions.
 * Payload: `{ v: 1, n: name, s: [[resortId, firstAt], …], k: [bus, drive, walk], t: trips }`.
 */
export const MAX_CODE = 4000;
const MAX_STAMPS = 50;
const PREFIX = "#rider=";

export type RiderCardData = {
  name: string;
  /** resort id → the day its stamp was earned */
  stamps: Record<string, string>;
  stats: RiderState["stats"];
};
export type RiderDecode =
  | { ok: true; card: RiderCardData }
  | { ok: false; error: string };

export function encodeRider(state: RiderState): string {
  return toBase64url(
    JSON.stringify({
      v: 1,
      n: state.name,
      s: Object.values(state.stamps).map((s) => [s.resortId, s.firstAt]),
      k: [state.stats.km.bus, state.stats.km.drive, state.stats.km.walk],
      t: state.stats.trips,
    }),
  );
}

export function riderShareUrl(origin: string, code: string): string {
  return `${origin}/${PREFIX}${code}`;
}

export function readRiderHash(hash: string): string | null {
  return hash.startsWith(PREFIX) ? hash.slice(PREFIX.length) || null : null;
}

const ID = /^[a-z0-9-]{1,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const km = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1_000_000;

export function decodeRider(code: string): RiderDecode {
  if (code.length > MAX_CODE) {
    return { ok: false, error: "This rider link is too long to be real." };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64url(code));
  } catch {
    return { ok: false, error: "This link is damaged or incomplete." };
  }
  const r = raw as {
    v?: unknown;
    n?: unknown;
    s?: unknown;
    k?: unknown;
    t?: unknown;
  };
  const bad = { ok: false as const, error: "This isn't a rider card link." };
  if (
    r?.v !== 1 ||
    typeof r.n !== "string" ||
    r.n.length === 0 ||
    r.n.length > MAX_NAME ||
    !Array.isArray(r.s) ||
    r.s.length > MAX_STAMPS ||
    !Array.isArray(r.k) ||
    r.k.length !== 3 ||
    !r.k.every(km) ||
    !Number.isInteger(r.t) ||
    (r.t as number) < 0
  )
    return bad;
  const stamps: Record<string, string> = {};
  for (const row of r.s) {
    if (!Array.isArray(row) || row.length !== 2) return bad;
    const [id, date] = row as unknown[];
    if (
      typeof id !== "string" ||
      !ID.test(id) ||
      typeof date !== "string" ||
      !DATE.test(date)
    )
      return bad;
    stamps[id] = date;
  }
  const [bus, drive, walk] = r.k as number[];
  return {
    ok: true,
    card: {
      name: r.n,
      stamps,
      stats: { km: { bus, drive, walk }, trips: r.t as number },
    },
  };
}
