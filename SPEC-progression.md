# Spec: progression

> Module of [SPEC.md](SPEC.md). Depends on: `resort-catalog` (access points), `snow-conditions` (fresh snow),
> `pilot` (trip arrival and distance). Consumed by: `web-app`.
> Added 2026-10-31 (v1.6). Decisions: stored on this device only (like saved-places); no accounts, server
> or anti-cheat; positions are checked, never stored.

## Objective
Give real ski days a reason to collect and come back: a **stamp** for every resort you actually
reach, **powder quests** that point you at today's best snow, and a rider card that shows how far
you've travelled. All of it rewards things you really did, and the planner's answers stay the same.

## Data (browser `localStorage`, key `hakuba:rider`)
```ts
type Stamp = { resortId: string; firstAt: string; visits: string[] }; // ISO dates (JST), ≤ 100 visits kept
type QuestState = { id: string; date: string; status: "active" | "done"; doneAt?: string };
type RiderState = {
  version: 1;
  name: string;                       // default "Rider", ≤ 20 chars
  stamps: Record<string, Stamp>;      // by resort id
  quests: QuestState[];               // today's, plus done ones (≤ 200 kept)
  stats: { km: { bus: number; drive: number; walk: number }; trips: number };
};
```
- Every read is validated. A corrupt or unknown version → start empty, keep the raw value under
  `hakuba:rider-corrupt`, and never throw. Every access is wrapped in try/catch, as in saved-places.
- **Every shape change bumps `version` and ships a migration with a test.** `MIGRATIONS[n]` in `rider.ts`
  turns a version-n save into version n+1 as a pure function; reads run every step up to the current
  version before validating. Stamps live only on each friend's phone, so a missing step would erase them.
- Tabs stay in sync with the `storage` event. React reads the store with `useSyncExternalStore`.
- **No positions, routes or timestamps finer than the day are stored.**

## Stamps
A visit counts when you are **at** a resort:
1. **Arrival:** a pilot trip whose destination is a resort reaches the `arrived` phase within 150 m of
   one of that resort's access points.
2. **Check in:** the resort card's "Check in" button takes one GPS fix (asked for by that tap, never in
   the background). It counts when the fix's accuracy is ≤ 100 m and it is within 300 m of an access point.
   Too far → "You're 2.4 km from Happo-One's base"; poor accuracy → "Can't place you precisely".
- **The first visit earns the stamp.** Later visits on other days are added to `visits`, at most one per day (JST).
- **The stamp moment:** a dialog box "Stamp earned: Happo-One · World 5", the `stamp` sound, and the hero's `ride`
  pose. Screen readers hear it through an `aria-live` announcement.

## Rider titles (from distinct stamps; 10 worlds today)
| Stamps | Title |
|---|---|
| 0 | Rookie |
| 1 | First Tracks |
| 3 | Valley Rider |
| 5 | Powder Hunter |
| 8 | Ridge Runner |
| every world in the catalog (10) | Hakuba Legend |

## Quests (made on the device each day, JST)
`questsFor(date, rider, resorts, snow)` is a pure function: the same inputs always give the same quests. At most 3 a day:
| Quest | Offered when | Done when |
|---|---|---|
| **Powder day:** "N cm fell at X: ride there today" | a resort's fresh snow is ≥ 10 cm (the biggest one) | a visit to X that day |
| **New world:** "Explore X" | at least one resort has no stamp yet (the nearest unstamped one by drive time; else the lowest world number) | a stamp at X |
| **Konbini break:** "Stop at a konbini on the way" | every day (it only finishes on a navigated trip, so it never nags) | a pilot trip with a convenience-store stop (or to one) arrives |

- Quests expire at midnight JST. A done quest stays in the log.
- If the snow data can't be loaded, Powder day isn't offered that day. Quests never show a made-up number.

## Stats
- **Distance:** kilometres by mode, counted only for **pilot trips**, using the distance actually covered along the
  route (`pilot` progress) at arrival or when the trip is stopped. Planning a route doesn't count.
- **Trips:** pilot trips that reached `arrived`.

## Rider card and share
- **The card:** the rider's name and title, a stamp grid with one slot per world (W1–W10 today, stamped or empty), the
  stats, and today's quests.
- **Share:** a link `#rider=<code>` (compressed JSON: name, stamp ids and first dates, stats). Like
  saved-places share links, the receiver sees a read-only card and nothing is imported. The code never includes visit dates.
- **Reset progress:** in the card, behind a confirmation.

## Acceptance criteria
- [ ] Arrival within 150 m earns the stamp; at 200 m it doesn't. A second arrival on the same day adds no visit; the next day adds one.
- [ ] Check in: within 300 m with accuracy ≤ 100 m counts; too far and poor accuracy each show their message; nothing is stored about the fix.
- [ ] The titles follow the table at every threshold.
- [ ] `questsFor` is deterministic. Powder day needs ≥ 10 cm and picks the biggest; it isn't offered without snow data; there are never more than 3 quests; quests expire at midnight JST.
- [ ] Stats count only pilot trips, by mode, with the distance covered.
- [ ] Corrupt storage → empty progress with the raw value kept; private mode (storage throws) → the app still works, and progress lasts only for the session.
- [ ] Share links round-trip name, stamps and stats; a tampered or oversized code is rejected with a message.

## Boundaries
- **Always:** validate storage; keep it on the device; ask for GPS only on a user tap or during navigation the user started.
- **Ask first:** syncing progress to a server, leaderboards, or anything that leaves the device; background location.
- **Never:** store or share positions or routes; invent snow numbers for a quest; make a stamp depend on anything but being there.
