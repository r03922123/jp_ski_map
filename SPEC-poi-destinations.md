# Spec: poi-destinations

> Module of [SPEC.md](SPEC.md). Depends on: `routing`. Consumed by: `web-app`. Added 2026-10-30 (v1.1).

## Objective
Besides ski resorts, let the user pick a **restaurant** or a **convenience store** (konbini) as the
destination, so the app can answer "where's the nearest konbini / somewhere to eat, and how long to get there?"
with the same walking route and ETA as for a resort (Drive until 2026-11-25). Shuttle buses only serve resorts, so the 🚌 tab
does not offer these destinations.

## Data
- Snapshot `data/poi_osm.json`, refreshed by `python -m hakuba_api.pois.refresh_pois` (Overpass, the
  same bbox and retry/mirror logic as `places/refresh_lodging`). It is never queried live per request.
- Categories (OSM tags → our category):
  | Category | OSM tags |
  |---|---|
  | `food` | `amenity=restaurant\|cafe\|fast_food\|food_court\|pub\|bar` (bars/pubs often serve food in Hakuba) |
  | `convenience` | `shop=convenience` (7-Eleven, Lawson, FamilyMart, Seicomart …) |
- Each entry: `id` (`osm-node-123`), `category`, `name` (`name:en` → `name` → brand), `nameJa`, `coord`,
  `cuisine?`, `brand?`, `openingHours?` (raw OSM string, shown as-is, not interpreted in v1.1).
  Unnamed entries are dropped. Ways/relations use their Overpass `center`.
- The validator checks: unique ids, coords inside the Hakuba bbox, category is in the enum.

## Interface
`GET /api/pois/nearby?from=lat,lng&category=food|convenience&mode=bus|walk&limit=10` (the web and the MCP tool send `walk`) → `NearbyPoi[]`
```jsonc
{ "id": "osm-node-123", "category": "convenience", "name": "7-Eleven Hakuba Happo",
  "nameJa": "セブン-イレブン 白馬八方店", "coord": {"lat":36.69,"lng":137.84},
  "brand": "7-Eleven", "cuisine": null, "openingHours": "24/7",
  "durationS": 240, "distanceM": 1500 }
```
1. Prefilter the 25 nearest by straight-line distance (cheap), then do one Valhalla matrix call for `mode`.
2. Drop unreachable targets, sort by `durationS`, and return the first `limit` (≤ 25).
3. The result is cached in-process for 10 min per (rounded origin, category, mode).

## Acceptance Criteria
- [ ] Refresh script (recorded Overpass fixture) → a valid `poi_osm.json` with both categories, unnamed nodes dropped, and way centres used.
- [ ] Nearby from the JR Hakuba Station coordinate, `convenience`, `walk` → sorted by `durationS`, with every item within the limit and a duration that isn't null.
- [ ] Unknown category → 422. Valhalla down → 503 (the same error shape as `/api/route`).
- [ ] The live snapshot has ≥ 10 konbini and ≥ 50 food places in Hakuba Valley (sanity check, run once).

## Boundaries
- Never: show or store Google Places content outside the Places UI Kit element of v1.2 (only place IDs
  are stored). Never call Overpass per user request.
- Ask first: adding ratings or photos beyond v1.2, or interpreting opening hours ("open now").

## v1.2 — Google rating card (approved 2026-11-25)
**Problem:** the owner wants review scores for restaurants. OpenStreetMap has none. Tabelog's terms forbid
storing its information without consent (clause 9(1)[1]), and its Cloudflare returns 403 to scripted
requests (measured 2026-11-25), so Tabelog is out. Google's Places API content must not be used "in
conjunction with a non-Google map" (Maps Service Specific Terms 15.2) and may not be cached, except place
IDs. Places UI Kit is the exception: it may be used "with or without any map, including a non-Google Map"
(16.1).

**Design:** we store only Google place IDs. Google's own `gmp-place-details-compact` element shows the
rating, review count, photo and attribution inside our card. The list keeps its travel-time order: we hold
no scores to sort by.

1. **Place IDs, once per season.** `python -m hakuba_api.pois.refresh_google_ids` (network; run by the
   owner with a server key in `GOOGLE_PLACES_SERVER_KEY`, never in CI) sends one Text Search (New) request
   per food POI with field mask `places.id` (SKU "Text Search Essentials (IDs Only)", free and unlimited):
   `textQuery` = `nameJa` or else `name`, `locationRestriction` = a rectangle about 200 m across centred
   on the POI, `pageSize` 1. It writes `data/poi_google.json` (`{"<poi id>": "<place id>"}`, matched POIs
   only) and `data/poi_google.meta.json` (run date, counts matched and unmatched). Google allows storing
   place IDs indefinitely and suggests refreshing those older than 12 months.
2. **API.** `Poi` gains `googlePlaceId: str | None = None`, joined from `poi_google.json` at load.
   `/api/pois/nearby` returns it (so does the MCP `nearby_pois` tool, which is fine: an ID is no Google
   content), and `api-types.ts` is regenerated. `hakuba_api/data/validate.py` loads the new file.
   `scripts/deploy-vercel.sh` copies it with the other data files, and `scripts/test-deploy-vercel.sh`
   lists it, because a missing file would silently show no cards in production.
   `refresh_pois` drops keys whose POI no longer exists, so an OSM refresh never breaks the validator
   while the place IDs wait for the owner's next run.
3. **Web.** Selecting a food row that has a `googlePlaceId` shows, inside that row's `<li>` after its
   `<button>` (never inside the button), `gmp-place-details-compact` (horizontal) holding a
   `gmp-place-details-place-request place="<id>"` child plus `gmp-place-media`, `gmp-place-rating` and
   `gmp-place-attribution`. The Maps JavaScript API loads on the first such selection only, with the key
   in `NEXT_PUBLIC_GOOGLE_MAPS_KEY`. No key, no place ID, or a load failure → no card and no error; the
   list works as before. Each selection is one billed element load ("Places UI Kit Query": 10,000 free a
   month, then $1.00 per 1,000; the owner confirms the SKU in the billing console after the first load,
   since Google bills the "Advanced" elements to Places UI Kit Pro).
4. **Credits.** The element draws Google's attribution itself; we never hide or restyle it beyond the
   documented colours. `DATA-LICENSES.md` gets a row for `poi_google.json`: Google place IDs, stored under
   Google's place-ID policy, no other Google content.

**Owner setup (only the owner can do this):** a Google Cloud project with a billing account; enable
Places UI Kit, Maps JavaScript API and Places API (New); a browser key restricted to the production domain
and `localhost` referrers and to the first two APIs, set as `NEXT_PUBLIC_GOOGLE_MAPS_KEY` in Vercel and in
`apps/web/.env.local`; a separate server key restricted to Places API (New), kept out of git; daily quota
caps of 300 element loads and 200 text searches. Expected cost at friends-only traffic: $0 a month.

**Acceptance:**
- [x] Refresh unit tests with a recorded response (no key, no `X-Goog-Api-Key` header in the fixture):
  the request has the field mask (Google's `X-Goog-FieldMask` header), and its body the rectangle and `nameJa` first; a response `{}` with no `places`
  leaves the POI out; the output validates.
- [x] The validator checks that every key in `poi_google.json` is a food POI in `poi_osm.json` and every
  value is a non-empty place ID.
- [x] `/api/pois/nearby` returns `googlePlaceId` for a matched POI and `null` for an unmatched one.
- [x] `PoiList` tests: a selected row with a place ID and a key renders a
  `gmp-place-details-place-request` whose `place` is that ID;
  without either it renders nothing; the Google script is not requested before a selection.
- [x] The deploy-script test fails when `poi_google.json` is missing from the copied files.
- [ ] With a real key on the dev server, the owner opens the first 10 food results (walk) from the JR
  Hakuba Station coordinate and records in the PR how many show the right restaurant. Fewer than 9 of 10 → tighten the rectangle or match rule before shipping.

**Not doing:** sorting or filtering by Google rating (we hold no scores, and UI Kit offers no sort);
Tabelog scores; a Google base map.

**Open question for the owner:** Maps ToS 3.2.3(d)(iii) bans Core Services "in a listings or directory
service", and 16.1 overrides only the non-Google-map clause. Google doesn't define the term. Assumption,
until the owner decides otherwise: a ski trip planner showing restaurants as destinations is not a
listings service, and committing place IDs to a public repo is storage Google allows, not
redistribution of Google content.
