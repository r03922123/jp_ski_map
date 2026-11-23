# Spec: ski-runs

> Module of [SPEC.md](SPEC.md). Depends on: `resort-catalog` (resort ids). Consumed by: `web-app`. Proposed 2026-11-23,
> the owner's first pick from the UX reference review (OpenSkiMap).

## Objective

Draw each resort's ski runs and lifts on the map, coloured by difficulty, the way
[OpenSkiMap](https://openskimap.org) and a resort's paper trail map do. Today the map shows a resort as one chip,
so a skier can't see the mountain, which lifts go where, or how big Happo-One is next to Sanosaka. With runs and
lifts drawn, the map answers "what is this resort like" before the user opens a card.

Users: the author and friends planning a day in Hakuba, on a phone or a laptop.

## Done means

1. `data/ski_lines.json` holds the operating runs and lifts of the 10 resorts (`data/resorts.json`), refreshed by
   one command, validated by `python -m hakuba_api.data.validate`.
2. `GET /api/ski-lines` serves them as one GeoJSON FeatureCollection.
3. From zoom 12 the map draws runs coloured by difficulty and lifts as dark red lines, under the routes and
   markers; names appear from zoom 14.
4. The map credits name OpenSkiMap, and `DATA-LICENSES.md` has a row for the file.

## Data

**Source: the OpenSkiMap API, one bounding-box query per kind, at refresh time only.** Measured 2026-11-23:

| Request | Answer |
|---|---|
| `https://api.openskimap.org/features.geojson?bbox=137.75,36.55,137.95,36.90&types=run` | 200, 227 runs, 918 KB |
| same with `types=lift` | 200, 93 lifts, 460 KB |
| both, trimmed to the fields below, coordinates rounded to 5 dp | 152 KB, 31 KB gzipped |

The bbox is `HAKUBA_BBOX` (`services/api/src/hakuba_api/common/geo.py`). Every one of the 10 resorts appears as an
`operating` ski area (Sakka's runs sit under Happo One). 10 runs have no ski area; they are dropped.

Why OpenSkiMap rather than our own Overpass query (the `pois/refresh_pois.py` pattern): OpenSkiMap's processor
already links each run and lift to its ski area, drops runs of closed areas (Hakuba Highland, Sun Alpina and
Minekata are in the bbox and marked `abandoned`), and normalises difficulty. Raw OSM tags would make us rebuild
that. The world GeoJSON files (257 MB gzipped for runs) and running their processor (Docker, 4 GB RAM) are both
far more than a 31 KB crop needs.

**Refresh:** `python -m hakuba_api.skiruns.refresh` (run by hand, like the POI refresh; at most once a day, per
[openskidata.org](https://openskidata.org) terms for automated downloads). It sends a generic User-Agent, keeps:

| Field | From | Notes |
|---|---|---|
| `id` | `properties.id` | unique in the file |
| `kind` | the request | `run` or `lift` |
| `name` | `properties.name` | may be null; OpenSkiMap names are mostly Japanese |
| `difficulty` | `properties.difficulty` (runs) | `novice\|easy\|intermediate\|advanced\|expert\|freeride\|extreme\|null` |
| `liftType` | `properties.liftType` (lifts) | `cable_car\|gondola\|chair_lift\|mixed_lift\|drag_lift\|t-bar\|j-bar\|platter\|rope_tow\|magic_carpet\|funicular\|railway` |
| `resortId` | matched from `skiAreas[].properties.name` to `data/resorts.json` names | features that match no resort are dropped |
| `geometry` | `geometry` | LineString or Polygon, 5 dp |

It keeps runs whose `uses` include `downhill` or `snow_park`, and lifts whose `status` is `operating`
(one lift in the bbox is `disused`). Nordic and connection paths are out (v1). It prints a count per resort.

OpenSkiMap warns its format may change (attributes added, renamed or removed). The refresh parses with Pydantic and
fails loudly on a missing field; the app only ever reads the committed snapshot, so a format change can break the
refresh, never the site.

**Validator** (joins `hakuba_api.data.validate`): unique ids; every coordinate inside `HAKUBA_BBOX`; each line has
≥ 2 points; `difficulty` and `liftType` in their enums; every `resortId` exists in `resorts.json`; each of the
10 resorts has ≥ 1 lift.

## Interface

`GET /api/ski-lines` → GeoJSON `FeatureCollection`; each feature's properties are the table above minus
`geometry`. Read once at startup, served with `Cache-Control: public, max-age=86400`. No query parameters: the
whole valley is 31 KB gzipped.

## Map (web-app)

- New `components/map/SkiLinesLayer.tsx`, fetched with TanStack Query, mounted in `MapView` before
  `LodgingLayer` so routes, markers and pins draw on top. Not interactive in v1 (taps pass through to the map).
- Colours follow OpenSkiMap's Japan convention (`difficultyConvention: "japan"`, from its `getRunColorName`):

  | Difficulty | Colour |
  |---|---|
  | novice, easy | green `hsl(125,100%,33%)` |
  | intermediate | red `hsl(359,94%,53%)` |
  | advanced, expert | black |
  | freeride, extreme | orange `hsl(34,100%,50%)`, dashed |
  | null | grey `hsl(0,0%,35%)` |

  Lifts: `hsl(0,82%,42%)`, thinner than runs, with a white casing so they read over a red run.
- `minzoom` 12 (the valley overview stays clean); line names from zoom 14, along the line, Japanese name as
  given.
- Both phone and laptop. Shown in every mode; while navigating (pilot) the runs stay under the route line.
- Credits: `MAP_ATTRIBUTION` (`apps/web/src/lib/map-config.ts`) gains `Runs: OpenSkiMap` linking to
  https://openskimap.org.

## Licence

OpenSkiMap data is ODbL, built on OpenStreetMap. `DATA-LICENSES.md` gets a row for `data/ski_lines.json` with the
attribution OpenSkiData asks for ("Data from OpenSkiData / OpenSkiMap.org, © OpenStreetMap contributors (ODbL),
Skimap.org, Who's On First, © Mapterhorn"). The file stays ODbL like `data/poi_osm.json`; drawing it on the
map is a Produced Work (ODbL §4.5.b), so the map needs the credit only.

## Acceptance criteria

- [ ] Refresh against recorded fixtures (`tests/skiruns/fixtures/`, two small trimmed answers) writes a file the
      validator accepts; a fixture missing `difficulty` fails the refresh with the field name.
- [ ] Unit: a run with no ski area, a `nordic`-only run and a `disused` lift are dropped; a Happo One run gets
      `resortId: "happo-one"`.
- [ ] `GET /api/ski-lines` returns ≥ 200 runs and ≥ 90 lifts from the live snapshot, every resort present.
- [ ] e2e (dev, `window.__hakubaMap`): at Happo-One, zoom 14, `queryRenderedFeatures` on the run and lift layers
      returns features; at zoom 11 it returns none.
- [ ] e2e: a tap on a run where no marker is opens the same thing a tap on the map opens (the layer takes no taps).
- [ ] Screenshot on a 390 × 844 phone and a 1366 × 850 laptop at Happo-One, zoom 14, checked by eye: runs under
      the route line and markers, the credits line shows OpenSkiMap.
- [ ] API and web gates green; `python3 scripts/check_docs.py` passes.

## Boundaries

- Always: read the snapshot, never OpenSkiMap, per user request.
- Ask first: tapping a run for a card (name, difficulty, lift it starts from), lift-status or grooming data,
  nordic runs, 3D terrain.
- Never: use `tiles.openskimap.org` vector tiles in the app (their terms forbid it); download the world files on a
  schedule.

## Open questions

- Matching `skiAreas[].properties.name` to our resort ids: the names differ in script and wording
  ("白馬白馬岩岳, Hakuba Iwatake"). Proposed: an explicit `openskimapNames` list per resort in the refresh module,
  so a mismatch fails the refresh instead of dropping a resort.
- Whether the lodging pins (purple, hundreds at zoom 13–14) need thinning once runs share the map: check on the
  phone screenshot; if they hide the runs, that is its own task.
