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
5. Production serves it: `scripts/deploy-vercel.sh` copies only the data files it lists (line 63), so
   `ski_lines.json` joins that list and the matching list in `scripts/test-deploy-vercel.sh`.

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
| `resortId` | `skiAreas[0].properties.name`, by exact match in the table below | no ski area, or a ski area with `name: null`, is dropped |
| `geometry` | `geometry` | LineString or Polygon; longitude and latitude only (OpenSkiMap's third value, elevation, is dropped), 5 dp |

Ski-area names, matched by **exact string equality** (live names, 2026-11-23). Substring matching is wrong here:
Cortina's name contains 白馬岩岳, which is Iwatake. A named ski area missing from this table fails the refresh
with its name, so a renamed area can't silently drop a resort.

| `resortId` | OpenSkiMap ski-area name |
|---|---|
| `happo-one` | `白馬八方尾根, Hakuba Happo One` |
| `tsugaike` | `栂池高原, Tsugaike Kogen` |
| `goryu` | `白馬五竜, Hakuba Goryu` |
| `iwatake` | `白馬白馬岩岳, Hakuba Iwatake, 白馬岩岳` |
| `norikura` | `白馬乗鞍スキー場, Hakuba Norikura Onsen Ski Resort, はくばのりくらスキーじょう` |
| `hakuba47` | `白馬47, Hakuba 47` |
| `cortina` | `白馬コルチナ, Hakuba Cortina, 白馬岩岳コルチナ` |
| `kashimayari` | `鹿島槍スキー場, Kashimayari Snow Resort` |
| `jigatake` | `爺ガ岳スキー場, Jiigatake Snow Resort` |
| `sanosaka` | `白馬さのさか, Hakuba Sanosaka Snow Resort` |

It keeps runs whose `uses` include `downhill` or `snow_park`, and lifts whose `status` is `operating`
(one lift in the bbox is `disused`). Nordic and connection paths are out (v1). It prints a count per resort.

OpenSkiMap warns its format may change (attributes added, renamed or removed). The refresh parses with Pydantic and
fails loudly on a missing field; the app only ever reads the committed snapshot, so a format change can break the
refresh, never the site.

**Validator** (joins `hakuba_api.data.validate`): unique ids; every coordinate inside `HAKUBA_BBOX`; each line has
≥ 2 points (a Polygon ring ≥ 4, closed); `difficulty` and `liftType` in their enums; every `resortId` exists in `resorts.json`; each of the
10 resorts has ≥ 1 lift.

## Interface

`GET /api/ski-lines` → GeoJSON `FeatureCollection`; each feature's properties are the table above minus
`geometry`. Loaded lazily once per process with `@cache`, like `pois/store.py`, and served with the shared
`STATIC_CACHE` header (`catalog/router.py:8`, one hour), so a refreshed snapshot shows within an hour of a deploy.
No query parameters: the whole valley is 31 KB gzipped.

## Map (web-app)

- New `components/map/SkiLinesLayer.tsx`: a GeoJSON source whose `data` is the URL `/api/ski-lines`, so MapLibre
  fetches and parses it in its worker (no TanStack Query, no `JSON.parse` on the main thread). Mount order alone doesn't
  set the stacking: react-map-gl adds a layer when its source is ready. Each run and lift layer passes
  `beforeId={LODGING_LAYER}`, which keeps routes, markers and pins above it whenever it arrives.
- Tappable since v2 (see "v2: the OpenSkiMap look" below); in v1 a tap on a run was a tap on the map.
- Colours follow OpenSkiMap's Japan convention (`difficultyConvention: "japan"`, from its `getRunColorName`):

  | Difficulty | Colour |
  |---|---|
  | novice, easy | green `hsl(125,100%,33%)` |
  | intermediate | red `hsl(359,94%,53%)` |
  | advanced, expert | black |
  | freeride, extreme | orange `hsl(34,100%,50%)`, dashed (v1 draws solid: none in the snapshot, `tasks/todo.md`) |
  | null | grey `hsl(0,0%,35%)` |

  Lifts: `hsl(0,82%,42%)`, thinner than runs, with a white casing so they read over a red run.
- `minzoom` 10 since v2 (v1: 12); line names from zoom 14, along the line, Japanese name as
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
- [ ] Unit: a Cortina ski area is not matched to Iwatake; an unknown named ski area fails the refresh; a
      `name: null` ski area is dropped; elevation is stripped from every coordinate.
- [ ] Unit (web): each difficulty, and `null`, maps to the colour in the table above.
- [ ] e2e (dev, `window.__hakubaMap`): at Happo-One, zoom 14, `queryRenderedFeatures` on the run and lift layers
      returns features; at zoom 11 it returns none. The name label layer returns features at zoom 14, none at 13.
- [ ] e2e: in `getStyle().layers` every run and lift layer comes before `lodging-pins` and the route layers, as
      `pilot.spec.ts` checks layer order today.
- [ ] Unit (web): `interactiveLayerIds` stays `[LODGING_LAYER, ALT_HIT_LAYER]` (v1; v2 adds `SKI_HIT_LAYER`).
- [ ] `scripts/test-deploy-vercel.sh` passes with `ski_lines.json` in its list.
- [ ] Screenshot on a 390 × 844 phone and a 1366 × 850 laptop at Happo-One, zoom 14, checked by eye: runs under
      the route line and markers, the credits line shows OpenSkiMap.
- [ ] API and web gates green; `python3 scripts/check_docs.py` passes.

## Boundaries

- Always: read the snapshot, never OpenSkiMap, per user request.
- Ask first: lift-status or grooming data,
  nordic runs, 3D terrain.
- Never: use `tiles.openskimap.org` vector tiles in the app (their terms forbid it); download the world files on a
  schedule.

## v2: the OpenSkiMap look

Asked 2026-11-24: "I still can not get resort or line information from the current map". v1 drew the lines from
zoom 12 only, a tap on one did nothing, and the base map had no relief, so the mountain read as flat green. v2 makes
the map read and answer like OpenSkiMap, still from our snapshot (its vector tiles stay out, see Boundaries).

**Done means:**

1. Runs and lifts draw from zoom 10, so the valley overview (zoom 11) shows every resort's lines.
2. The base map has hillshade relief from [Mapterhorn](https://mapterhorn.com) terrain tiles (the source OpenSkiMap
   credits; its FAQ allows app and commercial use of `tiles.mapterhorn.com`, no rate limit), under water, roads and
   labels. The credits line names Mapterhorn (its TileJSON adds the credit).
3. A tap or click on a run or lift (a wide invisible hit line, `SKI_HIT_LAYER`) opens a card at that spot and draws the
   line in yellow under it, as OpenSkiMap does. The card shows the name, the kind ("Intermediate run", "Chairlift"),
   the resort (a button that opens the resort card), the length, the vertical with its bottom and top elevation, and
   the average slope. ✕, or a tap anywhere else on the map, closes it. While navigating, or with a stop box open, a
   tap keeps its v1 meaning.
4. The snapshot keeps three numbers per line, computed at refresh from OpenSkiMap's 3D coordinates before elevation
   is dropped: `lengthM` (horizontal, rounded to the metre; null for an area run), `minEleM` and `maxEleM` (null when
   a point has no elevation). The card's distance is the length along the slope, `hypot(length, vertical)`, as
   OpenSkiMap shows it, and its slope is `atan(vertical / length)`. Checked on the Kamo 1 lift: OpenSkiMap shows 890 m,
   282 m (751–1033 m), 19° (34%); ours gives 885 m, 282 m (751–1033 m), 19° (34%).

**Checks:** API unit tests for the three numbers from a hand-made line; web unit test for the card text; a MapView unit test for a
finger tap on a run whose null keys MapLibre dropped (no NaN, the pin card closes); the e2e zoom checks move from 12
to 10; an e2e click on Happo-One's Adam gondola opens its card; a phone screenshot at Happo-One.

**Not in v2:** contour lines (need the `maplibre-contour` package), a resort summary with run kilometres per
difficulty and lift counts (OpenSkiMap's ski-area panel), elevation profiles, 3D terrain.

## Open questions

- Whether the lodging pins (purple, hundreds at zoom 13–14) need thinning once runs share the map: check on the
  phone screenshot; if they hide the runs, that is its own task.
