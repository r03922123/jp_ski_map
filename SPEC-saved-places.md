# Spec: saved-places

> Module of [SPEC.md](SPEC.md). Depends on: nothing on the server (browser storage). Consumed by: `web-app`.
> Added 2026-10-30 (v1.3). Decisions: stored on this device + share link (no login, no database).

## Objective
Save time on every trip: star a place once (your hotel, a favourite ramen shop, a bus stop), then
start a route from it or to it in one tap, without searching again. Modelled on Google Maps' Saved
tab, as observed and described in Google's help pages (evidence below). We copy the behaviour, never
Google's code or data.

### Behaviour evidence (REA-style: claim → source → limits)
| Google Maps behaviour | Evidence | What we take |
|---|---|---|
| Default lists: Favorites, Want to go, Starred places, plus Labeled (Home/Work) | [Create a list of places](https://support.google.com/maps/answer/7280933); 2017 launch coverage (TechCrunch) | Three default lists + one **label**, "My hotel", Hakuba's equivalent of Home |
| "Save" on a place opens a list picker, where a new list can also be created | Help page above; Android Central how-to | Star button → list picker sheet; custom lists in v1.3 |
| Saved places show on the main map, and each list can be hidden or shown | Help page above | Saved layer with per-list visibility |
| Lists can be shared | Help page above | Share as a link; the receiver must confirm before importing |
| Saved places rank high in search | Observed behaviour, not in help docs (**unverified**) | Saved matches first in the dropdown, with the list icon |

## Data (browser `localStorage`, key `hakuba:saved`)
```ts
type SavedPlace = {
  id: string;              // stable: source id (e.g. "stop-happo-bt", "osm-node-1") or "pt:36.69812,137.86123"
  name: string;
  coord: { lat: number; lng: number };
  kind: "lodging" | "stop" | "resort" | "poi" | "pin";
  lists: string[];         // list ids; one place can be in several lists
  label?: "hotel";         // at most one place carries it
  note?: string;           // ≤ 140 chars
  savedAt: string;         // ISO
};
type SavedList = { id: string; name: string; icon: "star" | "heart" | "flag" | "bookmark"; hidden: boolean; builtIn: boolean };
type SavedState = { version: 1; lists: SavedList[]; places: SavedPlace[] };
```
- Built-in lists `starred` ⭐, `favorites` ❤, `want-to-go` 🚩 always exist and can't be deleted. Custom lists can be added (≤ 20 lists, ≤ 500 places).
- Every read is validated: a corrupt or unknown version → start empty, keep the raw value under `hakuba:saved-corrupt`, and never throw. Every access is wrapped in try/catch because private mode or blocked storage can throw.
- Tabs stay in sync through the `storage` event; React reads the store via `useSyncExternalStore`.

## Behaviour
1. **Save:** a ☆ button on every place card (the searched origin, a selected resort, a POI, a dropped pin, a bus stop) opens a list picker with ticks per list, "+ New list", and "Set as My hotel". The button turns ★ when the place is in any list.
2. **Saved panel:** a "Saved" chip next to the search box opens the lists, then the places in a list. Tapping a place shows **Start from here** (sets the origin) and **Go here** (sets a generic destination, drive/walk only, `dest=pt:lat,lng`). There are also Edit note, Remove, Move, and Hide list on map.
3. **My hotel:** if the URL has no `from=` and a place carries the hotel label, the app opens with it as the origin, and the search box shows "My hotel · <name>". Clearing the box doesn't remove the label.
4. **Map:** saved places draw as small icons (their list's icon) above the lodging pins, and tapping one opens its card. Hidden lists aren't drawn.
5. **Search:** saved places matching the query come first (≤ 3), with their list icon; on focus, before typing, they show above recent searches.
6. **Share / import:** "Share list" creates `https://<host>/#import=<base64url(JSON)>`. The data lives in the URL **fragment**, so it never reaches the server or its logs. Opening it shows "Add 12 places to 'Want to go'?" with a preview list, and only confirming writes anything. Malformed or oversized imports (> 200 places) are rejected with a message.

## Acceptance Criteria
- [ ] Unit: save/remove/move, one hotel label at most, built-in lists can't be deleted, corrupt storage → empty and kept aside, throwing storage → in-memory fallback, limits enforced.
- [ ] Unit: share encode → decode round-trips; the import validator rejects bad shapes, NaN coords and > 200 places.
- [ ] E2E: star a searched hotel → reload → ★ is still on and it's in Saved; "Start from here" sets the origin; "Go here" draws a route.
- [ ] E2E: My hotel label → open `/` → the origin is the hotel.
- [ ] E2E: open an import link → confirm → the places appear; cancel → nothing is stored.
- [ ] 390 px: picker and panel fit without horizontal scroll; every control has an accessible name.

## Boundaries
- Never: send saved places to our API or any third party, put them in query strings, or import without confirmation.
- Ask first: account sync / a server database; importing Google Takeout files.
