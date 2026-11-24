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
| `distanceM` | measured from the 3D line (v1.2) | length along the slope, m; null for a Polygon or a point with no elevation |
| `minElevationM`, `maxElevationM` | the coordinates' third value (v1.2) | m |
| `slopePct` | measured (v1.2) | average: (highest − lowest, both rounded to m) / length on the ground × 100, 1 dp; null like `distanceM` |
| `durationS` | `properties.duration` (lifts, v1.2) | ride time, s; null when OSM has none (85 of 92 lifts on 2026-11-23) |
| `profile` | `properties.elevationProfile` (runs, v1.4) | `{heightsM: int[], resolutionM}`: heights every ~25 m along the run on the ground, rounded to m; null for a lift, an area or a run OpenSkiMap has none for (1 of 217 on 2026-11-24) |

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

**Validator** (joins `hakuba_api.data.validate`): `minElevationM` ≤ `maxElevationM`; no ride time on a run; unique ids; every coordinate inside `HAKUBA_BBOX`; each line has
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
- **v1.1 (owner's request, 2026-11-23): a tap or click on a run or lift opens its card.** An invisible 16 px
  `ski-lines-hit` layer joins `interactiveLayerIds` (a run is 1.5–4 px wide). The card takes the dropped pin's
  place at the bottom (`SkiLineCard` on the shared `MapCard`): the name's first language as the title, the others
  under it, then a colour swatch and "Intermediate run · Hakuba Happo-One Snow Resort" or "Chair lift · …". The
  `ski-selected` layer outlines that line. An open stop box still takes the tap as the stop's point, and a
  long-press on a run still drops a pin. Out of v1.1: the run's length (MapLibre hands back the tile-clipped
  geometry, not the whole line) and the lift it starts from.
- **v1.2 (owner's request, 2026-11-23): the card shows OpenSkiMap's numbers.** Distance, vertical with its lowest and
  highest point, average slope, and for a lift with a ride time its speed, ride time and vertical speed
  (`lib/ski-stats.ts`). The refresh measures them before it drops the elevations, so a tap reads them from the
  feature's properties, which MapLibre keeps whole while it clips the geometry. Checked against OpenSkiMap's card
  for Gondola Adam: 2.04 km, 623 m (768–1391 m), 4.3 m/s, 8 min, 78 m/min, 18° (32%). A ski-area card is out:
  the resort's Details already shows its vertical, lifts and terrain mix from the resort's own site, and a second
  set of numbers from OpenSkiMap would disagree with it. The slope-aspect rose is out too (OpenSkiStats, another
  dataset and licence).
- **v1.3 (owner's request, 2026-11-24: "render the map as openskimap. I still can not get resort or line
  information").** Runs and lifts draw from zoom 10, so the valley overview (zoom 11) shows every resort's lines
  instead of bare resort chips. The base map gets OpenSkiMap's relief: a hillshade from
  [Mapterhorn](https://mapterhorn.com) terrain tiles (the source OpenSkiMap credits; its FAQ allows app and
  commercial use of `tiles.mapterhorn.com`, no rate limit), above land cover and under water, roads and labels. The
  source stops at z12 (about 19 m a pixel): Hakuba has no tile past z16, and each tile is about 190 KB. The tiles are
  named directly, not through Mapterhorn's TileJSON, whose credit would come first and push the OpenStreetMap link
  under the route's time chip on a landscape phone; `Terrain: Mapterhorn` comes last instead, and
  `DATA-LICENSES.md` has a row for it. Checks: the unit and e2e zoom checks move from 12 to 10 (lifts drawn at 11,
  nothing at 9), the credits e2e, and a phone screenshot. Out of v1.3: contour lines (the `maplibre-contour`
  package), 3D terrain.
- **v1.4 (owner's request, 2026-11-24: "show resort information and interactive line information in openskimap in
  the application for both desktop and mobile user", with screenshots of OpenSkiMap's ski-area panel and its run
  panel's height profile).** This replaces v1.2's "a ski-area card is out": the owner still could not find a resort's
  information from the map, because a tapped resort chip only picks the destination and the numbers sit in the
  resort list's Details, which needs a start first.
  - **Resort card.** A tap or click on a resort chip opens `ResortCard` on the shared `MapCard`, and still does what it
    did before (it picks the destination; while a stop box is open it fills the stop and opens no card). The run or
    lift card's resort name is a button that opens the same card. The card shows, as OpenSkiMap's does: the name
    (English title, Japanese under it); Vertical `1080 m (749–1829 m)` (Happo-One); Downhill runs `31.4 km` and a bar split by
    difficulty in the map's colours, with the same split as text for screen readers; Lifts `1 Gondola, 21 Chair lifts`;
    the resort's website. Every number is summed from this resort's runs and lifts in the snapshot
    (`lib/ski-stats.ts`), so the card matches the lines drawn; its source line says "Measured from OpenSkiMap's runs
    and lifts". While it is open, `ski-selected` outlines all the resort's lines.
  - **Height profile on the run card.** Under the numbers, a chart of the run's height against distance, coloured by
    slope with OpenSkiData's downhill scale (`openskidata-format` `getSlopeGradingScaleForUse`, MIT: under 5 % grey,
    under 25 % green, under 40 % red, under 100 % black, steeper orange), axes in m and km. Moving a mouse over it, or
    dragging a finger along it, shows the height and slope at that point (`1145 m · 14° (25%)`) and puts a ring on
    the map at that point of the run; arrow keys do the same from the keyboard. The card gains Ascent, Descent and
    Max slope from the profile. A lift has no chart (OpenSkiMap shows none).
  - **Data path.** The profile ships in `/api/ski-lines` (+6,345 heights: the file grew from 210 to 250 KB raw, 48
    to 62 KB gzipped, on 2026-11-24). MapLibre hands a tap the tile-clipped geometry, so the cards read the whole
    line from a TanStack query of the same URL, enabled when a card first opens; the browser serves it from the
    cache MapLibre's fetch filled (one hour). The card shows its numbers from the tapped feature at once and the
    chart when the query lands.
  - Phone and laptop: the card stays at the bottom on a phone and beside the side panel from `md`; the chart takes
    touch drags without scrolling the page (`touch-action: none`).
  - Out of v1.4: the slope-aspect rose (OpenSkiStats, another dataset), paper maps, zooming to the resort on tap (v1.5 adds it),
    a chart for lifts.
- **v1.5 (owner's request, 2026-11-24: "if choose the line, the card might cover the whole line. Make it as popped up
  card, reset to center view while selecting lane or resort or any better uiux idea", with a laptop screenshot of a
  run card over the run it describes).** The card keeps its place; the map moves. A tapped run or lift, or an opened
  resort card, frames its whole line (or all the resort's lines) in the part of the map no panel or card covers, the
  way the route fit and the dropped pin's ease already do. A card anchored to the line was dropped: on a 390 px phone a
  card the size of the run card would cover the line just as much, and it would chase the line as the map moves.
  - The clear part is measured, not guessed: the open card's top edge (the run card is about 365 px tall on a phone
    once its chart lands) plus a margin, the trip card on top on a phone, the side panel from `md`.
  - Framed with `fitBounds` once per pick, after the whole line has loaded (a tap's own geometry is tile-clipped), at
    most zoom 16, after the finger is up, without motion under `prefers-reduced-motion`.
  - While a ski card is open the route fit waits, so a resort chip tap with a start set frames the resort rather than
    the drive to it; closing the card fits the route again.
- Colours follow OpenSkiMap's Japan convention (`difficultyConvention: "japan"`, from its `getRunColorName`):

  | Difficulty | Colour |
  |---|---|
  | novice, easy | green `hsl(125,100%,33%)` |
  | intermediate | red `hsl(359,94%,53%)` |
  | advanced, expert | black |
  | freeride, extreme | orange `hsl(34,100%,50%)`, dashed (v1 draws solid: none in the snapshot, `tasks/todo.md`) |
  | null | grey `hsl(0,0%,35%)` |

  Lifts: `hsl(0,82%,42%)`, thinner than runs, with a white casing so they read over a red run.
- `minzoom` 10 since v1.3 (v1: 12); line names from zoom 14, along the line, Japanese name as
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
- [x] Unit (web): `interactiveLayerIds` is `[LODGING_LAYER, ALT_HIT_LAYER, SKI_HIT_LAYER]` (v1.1).
- [x] v1.1 unit: a tap or click on a run opens its card and picks no start; a long-press's lift-off and an open
      stop box don't open one. e2e: a click on a lift at Happo-One opens its card, `from` unchanged.
- [ ] `scripts/test-deploy-vercel.sh` passes with `ski_lines.json` in its list.
- [ ] Screenshot on a 390 × 844 phone and a 1366 × 850 laptop at Happo-One, zoom 14, checked by eye: runs under
      the route line and markers, the credits line shows OpenSkiMap.
- [ ] API and web gates green; `python3 scripts/check_docs.py` passes.
- [x] v1.4 API: the refresh keeps a run's profile with heights rounded to m and drops it for a lift; the validator
      rejects a profile with fewer than 2 heights; the live snapshot has a profile on ≥ 200 runs.
- [x] v1.4 unit (web): the resort summary of a fixture (vertical, km by difficulty, lifts by type); the profile's ascent,
      descent and max slope; each slope band's colour; the point at a fraction of a line.
- [x] v1.4 unit: a tapped resort chip opens the resort card and still selects the resort; with a stop box open it
      opens no card; the run card's resort name opens the resort card; moving over the chart reports a map point.
- [x] v1.4 e2e: at Happo-One a click on a resort chip shows "Downhill runs"; a click on a run shows the profile, and a
      hover over it puts the ring on the map.
- [x] v1.4 screenshots on a 390 × 844 phone and a 1366 × 850 laptop: the resort card, and the run card mid-drag with
      the ring on the run (`docs/screenshots/ski-v1.4-*.png`).

## Boundaries

- [ ] v1.5 unit: the clear-map padding for a phone and a laptop with a card open; a tapped run frames its whole
      line once, a resort card all its lines, and the route fit waits while either is open, then runs on close.
- [ ] v1.5 e2e: on a 390 × 844 phone and a 1366 × 850 laptop, after a click on a run its whole line projects inside
      the map above the card (and right of the side panel on the laptop); a click on a resort chip does the same for
      the resort's lines.
- [ ] v1.5 screenshots on both sizes: the run card open with its whole run in view.
- Always: read the snapshot, never OpenSkiMap, per user request.
- Ask first: the lift a run starts from, lift-status or grooming data, nordic runs, 3D terrain.
- Never: use `tiles.openskimap.org` vector tiles in the app (their terms forbid it); download the world files on a
  schedule.

## Open questions

- Whether the lodging pins (purple, hundreds at zoom 13–14) need thinning once runs share the map: check on the
  phone screenshot; if they hide the runs, that is its own task.
