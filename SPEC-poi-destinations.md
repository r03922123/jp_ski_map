# Spec: poi-destinations

> Module of [SPEC.md](SPEC.md). Depends on: `routing`. Consumed by: `web-app`. Added 2026-10-30 (v1.1).

## Objective
Besides ski resorts, let the user pick a **restaurant** or a **convenience store** (konbini) as the
destination, so the app can answer "where's the nearest konbini / somewhere to eat, and how long to get there?"
with the same drive/walk route and ETA as for a resort. Shuttle buses only serve resorts, so the 🚌 tab
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
`GET /api/pois/nearby?from=lat,lng&category=food|convenience&mode=drive|walk&limit=10` → `NearbyPoi[]`
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
- Never: query Google Places, or scrape review sites for ratings. Never call Overpass per user request.
- Ask first: adding ratings or photos, or interpreting opening hours ("open now").
