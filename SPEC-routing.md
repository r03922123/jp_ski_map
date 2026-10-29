# Spec: routing

> Module of [SPEC.md](SPEC.md). Depends on: — . Consumed by: bus-schedules, resort-ranking, web-app.

## Objective
Give driving and walking routes and ETAs, plus a one-to-many time matrix, using a self-hosted Valhalla. This is the "like Google Maps" routing layer.

## Infra
- `infra/docker-compose.yml` service `valhalla`: image `ghcr.io/valhalla/valhalla-scripted`, tile URL `https://download.geofabrik.de/asia/japan/chubu-latest.osm.pbf`, port 8002, tiles in `infra/valhalla/custom_files/` (gitignored).
- The API reads `VALHALLA_URL` (default `http://localhost:8002`).

## Interface
- `GET /api/route?mode=drive|walk&from=lat,lng&to=lat,lng` → `Route`
- `POST /api/matrix {mode, from:{lat,lng}, to:[{id,lat,lng}]}` → `[{id, durationS, distanceM} | {id, error}]`
```jsonc
// Route
{ "mode": "drive", "durationS": 612, "distanceM": 5400,
  "geometry": { "type": "LineString", "coordinates": [[137.85, 36.70], …] },   // GeoJSON [lng,lat]
  "steps": [{ "instruction": "Turn left onto …", "distanceM": 300, "durationS": 40 }],
  "isEstimate": true }
```
- Python: `routing.route(mode, a, b) -> Route`, `routing.matrix(mode, origin, targets) -> list[MatrixCell]`.
- Valhalla costing: `drive`→`auto`, `walk`→`pedestrian`. The encoded polyline (precision 6) is decoded server-side to GeoJSON.

## Acceptance Criteria
- [ ] Drive from JR Hakuba Station to the Happo-One Nakiyama access point: an ETA between 4 and 15 min and a route on real roads.
- [ ] Walk from the Happo Bus Terminal to the Happo-One Nakiyama access point: a pedestrian route with an ETA under 20 min.
- [ ] Matrix from one origin to all access points returns in < 500 ms locally.
- [ ] No route found (point in a forest, or off the graph) → 404 `{error:"no_route"}`. Valhalla down → 503.
- [ ] Coordinate-order conversion has unit tests (`{lat,lng}` ↔ `[lng,lat]`).

## Boundaries
- Ask first: switching to a hosted routing API (ORS/Mapbox/Google), or adding traffic data.
- Never: commit tiles.

## Notes
- ETAs come from typical road speeds, with no live traffic. Winter road conditions are not modeled, so the UI shows "ETA ~". **Decision (2026-10-28): show the raw Valhalla ETA with no winter multiplier.**

## v1.1 — Google-Maps-style routes (approved scope 2026-10-30)
Goal: the route experience reads like Google Maps directions. This section is the backend half; the UI is in [SPEC-web-app.md](SPEC-web-app.md#v11).

**Interface changes (additive, backwards compatible):**
- New `GET /api/routes?mode&from&to&alternates=0..2` → `RouteSet { primary: Route, alternates: Route[] }`. The existing `/api/route` stays as it is.
  Valhalla `alternates: n` (checked locally: JR Hakuba→Iwatake gives a primary of 17.5 min/7.6 km and an alternate of 18.8 min/9.6 km). Alternates that are more than 1.5× the primary's duration are dropped (Google doesn't offer absurd detours either).
- `Step` gains:
  - `maneuver`: a stable enum mapped from the Valhalla maneuver `type`: `depart, arrive, straight, slight-left, left, sharp-left, slight-right, right, sharp-right, uturn, roundabout, merge, ramp-left, ramp-right, keep-left, keep-right, ferry`.
  - `streetNames: string[]` (from Valhalla `street_names`, possibly empty).
  - `shapeRange: [begin, end]` (indices into `geometry.coordinates`, so the UI can highlight one step on the map).
- `POST /api/route/path {mode, points: [{lat,lng}, …]}` → `Route` along ordered via-points (Valhalla `through` locations for the middle points). It is used by the bus ride leg. There are at most 25 points.
- `Route.summary: string`: the 1–2 longest named roads, e.g. "via Route 31 and Hakuba Sanroku Rd". This is the "via …" line Google shows under each option.

**Acceptance:**
- [ ] Alternates: the recorded fixture with 1 alternate → `RouteSet.alternates` has length 1. An alternate > 1.5× the primary is dropped.
- [ ] Maneuver mapping: a unit table covers every Valhalla type 0–39, and unknown types fall back to `straight`.
- [ ] `shapeRange` of consecutive steps tiles the geometry (end of step i == begin of step i+1).
- [ ] `/api/route/path` with 4 points returns one Route whose geometry passes within 50 m of every point.
