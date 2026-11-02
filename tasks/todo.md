# Tasks: Hakuba Ski Map

Plan: [plan.md](plan.md). Every task also has to meet the Definition of Done: quality gates from SPEC.md green, no regressions, behavior checked at runtime, specs updated if a decision changed.

Gate shorthand:
- **API gates** = `uv run --project services/api ruff check && uv run --project services/api pyright && uv run --project services/api pytest -q`
- **Web gates** = `pnpm --dir apps/web lint && pnpm --dir apps/web typecheck && pnpm --dir apps/web test && pnpm --dir apps/web build`

---

## Phase 1: Foundation

## Task 1: Scaffold API service ✅
**Description:** Create `services/api` with uv, FastAPI, Pydantic v2 (camelCase alias config in a shared base model), ruff, pyright, pytest and respx. Add `GET /api/health`. Run `git init` with a `.gitignore` (tiles, raw downloads, `.venv`, `node_modules`, `.next`).
**Acceptance criteria:**
- [x] `fastapi dev` serves `/api/health` → `{"status":"ok"}` and `/openapi.json`
- [x] A shared `ApiModel` base serializes snake_case fields as camelCase (unit test)
**Verification:** API gates pass; `curl 127.0.0.1:8010/api/health`
**Dependencies:** None
**Files:** `services/api/pyproject.toml`, `src/hakuba_api/main.py`, `src/hakuba_api/common/models.py`, `tests/test_health.py`, `.gitignore`
**Scope:** S

## Task 2: Scaffold web app with base map ✅
**Description:** Create `apps/web`: Next.js (App Router, TS strict), Tailwind, shadcn/ui init, Biome, Vitest and Playwright, TanStack Query provider. Add a full-screen MapLibre map (OpenFreeMap liberty style) centered on Hakuba (36.70, 137.86, z11) with attribution. Add the `gen:api` script (openapi-typescript) and a `/api` rewrite to `http://127.0.0.1:8010` (env `API_URL`).
**Acceptance criteria:**
- [x] `pnpm dev` shows a full-screen map of Hakuba with OSM/OpenFreeMap attribution
- [x] `pnpm gen:api` produces `src/lib/api-types.ts` from the running API
**Verification:** Web gates pass; open http://localhost:3000 manually
**Dependencies:** T1 (for gen:api)
**Files:** `apps/web/package.json`, `next.config.ts`, `src/app/page.tsx`, `src/components/MapView.tsx`, `biome.json`
**Scope:** M
**Notes:** shadcn/ui init deferred to T6 (first real UI component). MapLibre 6 worker is served from `public/maplibre/` via `scripts/copy-maplibre-worker.mjs` because bundling breaks its default worker URL.

## Task 3: Valhalla in Docker + live smoke test ✅
**Description:** Write `infra/docker-compose.yml` with a valhalla service (Chubu extract, port 8002, tiles volume gitignored). Add a `@pytest.mark.live` smoke test that routes JR Hakuba Station → the Happo area.
**Acceptance criteria:**
- [x] `docker compose up -d valhalla` builds tiles and `/status` responds
- [x] The live test returns a route with an `auto` duration between 2 and 15 min
**Verification:** `uv run --project services/api pytest -m live -k valhalla`
**Dependencies:** T1
**Files:** `infra/docker-compose.yml`, `infra/valhalla/.gitkeep`, `services/api/tests/live/test_valhalla_smoke.py`, `services/api/pyproject.toml` (marker)
**Scope:** S — **high risk, do it early** (Apple Silicon image/tile build)

## Task 4: Resort catalog — models, validator, resorts.json ✅
**Description:** Pydantic models for Resort/AccessPoint/Stats. Fill `data/resorts.json` with all 10 resorts (real access point coordinates from OSM or the resort sites, stats with `statsSource`, `null` when unknown). Add the `data.validate` entrypoint (duplicate ids, EN/JA names, bbox, terrain sums to 100) and `GET /api/resorts`. Bus stops come in T17.
**Acceptance criteria:**
- [x] 10 resorts; Goryu has Escal Plaza + Iimori access points; no invented values
- [x] The validator rejects each bad-data case (one unit test per rule)
- [x] `/api/resorts` returns all 10 in camelCase
**Verification:** API gates; `python -m hakuba_api.data.validate` exits 0
**Dependencies:** T1
**Files:** `src/hakuba_api/catalog/{models,store,router}.py`, `src/hakuba_api/data/validate.py`, `data/resorts.json`, `tests/catalog/test_catalog.py`
**Scope:** M

## Checkpoint A: Foundation
- [ ] API + web gates green
- [ ] Map renders; `/api/resorts` returns 10; Valhalla smoke test passes
- [ ] Review with human before proceeding

---

## Phase 2: Slice 1 — Walk & Drive routes

## Task 5: Routing adapter + /api/route ✅
**Description:** A `routing` package with `route(mode, a, b)` that calls Valhalla `/route` (auto | pedestrian), decodes the precision-6 polyline to GeoJSON, and maps the maneuvers to steps. Errors: no route → 404 `no_route`, Valhalla down → 503. Add `GET /api/route`.
**Acceptance criteria:**
- [x] Coordinate conversion and polyline decoding have unit tests
- [x] Contract tests use a recorded Valhalla fixture (drive + walk) and the error cases
- [x] Live: Happo Bus Terminal → Nakiyama walk < 20 min
**Verification:** API gates; `pytest -m live -k route`
**Dependencies:** T3, T4 (access point coords for the live test)
**Files:** `src/hakuba_api/routing/{client,models,polyline,router}.py`, `tests/routing/test_routing.py`, `tests/fixtures/valhalla/*.json`
**Scope:** M

## Task 6: Web — origin pin + 🚶/🚗 route to a resort ✅
**Description:** Show resort markers from `/api/resorts`. Map click (long-press on touch) sets the origin pin. A side panel with Drive/Walk tabs (Bus tab disabled, "coming soon") and a resort picker. Selecting a resort fetches `/api/route`, draws the line, and shows "ETA ~ X min · Y km" plus the steps. Errors are shown inside the panel.
**Acceptance criteria:**
- [x] Click map → choose Happo-One → the drive line and ETA render; switching to Walk redraws
- [x] A 404 `no_route` shows an inline message, and the map stays usable
- [x] Component tests cover the ETA formatting and the tab switching
**Verification:** Web gates; manual check against the running API + Valhalla
**Dependencies:** T2, T5
**Files:** `src/components/{OriginPin,ModePanel,RouteLayer,ResortPicker}.tsx`, `src/lib/{api,format}.ts`, `tests/ModePanel.test.tsx`
**Scope:** M

## Task 7: Web — URL state + responsive bottom sheet ✅
**Description:** Sync `from`, `mode` and `resort` to the URL (reload restores the view). At < 768 px the panel becomes a draggable bottom sheet. Visible focus and keyboard-navigable tabs.
**Acceptance criteria:**
- [x] Reloading `?from=…&mode=walk&resort=happo-one` redraws the same route
- [x] At 390 px there's no horizontal scroll, and the sheet drags between collapsed and expanded
**Verification:** Web gates; Playwright test `e2e/url-state.spec.ts` at a mobile viewport
**Dependencies:** T6
**Files:** `src/lib/url-state.ts`, `src/components/{ModePanel,BottomSheet}.tsx`, `e2e/url-state.spec.ts`
**Scope:** M

## Checkpoint B: First usable flow
- [ ] Click → resort → walk/drive route + ETA works on desktop and mobile
- [ ] Review with human before proceeding

---

## Phase 3: Slice 2 — Search

## Task 8: Photon search + Google Maps link parsing ✅
**Description:** `GET /api/places/search`. If the query is a Google Maps URL, parse `@lat,lng`, `!3d!4d` or `?q=lat,lng` plus the `/place/<name>/` segment; for `maps.app.goo.gl` links, follow one redirect hop. Otherwise call Photon with the Hakuba bias, put out-of-bbox results last, and cache for 24 h.
**Acceptance criteria:**
- [x] Unit tests for the 3 URL coordinate formats and the name extraction; a non-Google URL → treated as text
- [x] Contract tests (Photon fixtures): an English query (Hotel Hakuba) and a Japanese one (白馬東急ホテル) hit the top 3; empty q → 422; upstream down → 502
- [x] Live: a pasted short link for Courtyard Hakuba resolves to within 50 m (real link created via Google Maps Share in an isolated headless browser, 2026-10-29)
**Verification:** API gates; `pytest -m live -k places`
**Dependencies:** T1
**Files:** `src/hakuba_api/places/{photon,gmaps_link,router,models}.py`, `tests/places/test_search.py`, `tests/fixtures/photon/*.json`
**Scope:** M

## Task 9: Lodging snapshot + /api/places/lodging ✅
**Description:** The `places.refresh_lodging` script queries Overpass (with retry/backoff over 2 mirrors) for the Hakuba bbox and writes `data/lodging_osm.json`. `GET /api/places/lodging?bbox=` serves from that snapshot; a bbox larger than 0.25° → 422.
**Acceptance criteria:**
- [x] The snapshot has ≥ 20 POIs in the Happo/Echoland bbox
- [x] Retry logic has a unit test (fake 502 → 502 → 200)
**Verification:** API gates; run the script once and check the count
**Dependencies:** T1
**Files:** `src/hakuba_api/places/{overpass,refresh_lodging,router}.py`, `data/lodging_osm.json`, `tests/places/test_lodging.py`
**Scope:** S

## Task 10: Web — search box + lodging pins ✅
**Description:** A search box with 300 ms debounce and keyboard navigation of the results. Selecting a result sets the origin. With no results it hints "Paste a Google Maps link or tap the map". Lodging pins show at zoom ≥ 14, and clicking a pin sets the origin.
**Acceptance criteria:**
- [x] Typing "Hotel Hakuba" → select → the origin moves there; pasting a Google Maps URL also works
- [x] At most 1 request per 300 ms while typing (component test with fake timers)
**Verification:** Web gates; Playwright `e2e/search.spec.ts`
**Dependencies:** T6, T8, T9
**Files:** `src/components/{SearchBox,LodgingLayer}.tsx`, `tests/SearchBox.test.tsx`, `e2e/search.spec.ts`
**Scope:** M

## Checkpoint C: Search
- [ ] Spot-check: the 4 English-named + 2 Japanese-named hotels are found; the 4 missing ones work via link paste
- [ ] Review with human

---

## Phase 4: Slice 3 — Conditions & Ranking

## Task 11: Snow conditions + /api/snow ✅
**Description:** An Open-Meteo adapter per resort (summit + base, explicit elevation, past_days=3, forecast_days=3, Asia/Tokyo). Compute depth and new snow for past24/72 and next24/72. Cache for 1 h. Missing values stay null.
**Acceptance criteria:**
- [x] The sums are correct against a recorded winter fixture (unit test)
- [x] An upstream null stays null (never 0)
**Verification:** API gates; `pytest -m live -k snow` returns 10 reports
**Dependencies:** T4
**Files:** `src/hakuba_api/snow/{openmeteo,models,router}.py`, `tests/snow/test_snow.py`, `tests/fixtures/openmeteo/*.json`
**Scope:** S

## Task 12: Spike — hakubavalley.com Weather & Snow page (≤ 1 h) ✅
**Description:** Find out whether the per-resort reported snow depth and lifts-open can be parsed reliably. **No production code.** Record the findings and a recommendation in the Open Questions of `SPEC-snow-conditions.md`.
**Acceptance criteria:**
- [x] The spec is updated with a go/no-go and an example of the page structure
**Verification:** Human reads the spec update
**Dependencies:** None
**Files:** `SPEC-snow-conditions.md`
**Scope:** XS

## Task 13: Crowd heuristic + /api/crowd ✅
**Description:** `CrowdSource` protocol + `HeuristicCrowdSource` (JP holidays via the `holidays` package, `data/crowd_periods.json`, powder effect from snow, resort prior), all weights in one config. Every factor adds a `reasons` entry.
**Acceptance criteria:**
- [x] Mid-Jan weekday at Jigatake, no new snow → low; Lunar New Year Saturday at Happo-One with a 30 cm powder day → very_high
- [x] Deterministic; ≥ 90% line coverage on `crowd/heuristic.py`
**Verification:** API gates with `--cov=hakuba_api.crowd`
**Dependencies:** T4, T11
**Files:** `src/hakuba_api/crowd/{heuristic,models,router}.py`, `data/crowd_periods.json`, `tests/crowd/test_heuristic.py`
**Scope:** M — `holidays` is a new dependency; it's listed in this plan and approved along with it

## Task 14: Matrix + ranking + /api/rank ✅
**Description:** `routing.matrix` (Valhalla `sources_to_targets`) and `POST /api/matrix`. A pure `rank()` with 7 sort keys, null-last ordering, the tiebreak rule, and the 3 filters. `GET /api/rank` puts catalog + matrix + snow + crowd together.
**Acceptance criteria:**
- [x] Each sort key orders correctly on a fixture; null price comes last; filters work; unknown sort → 422
- [x] Live: `/api/rank` returns all 10 in < 1 s
**Verification:** API gates (≥ 90% coverage on `ranking/`); `pytest -m live -k rank`
**Dependencies:** T5, T11, T13
**Files:** `src/hakuba_api/routing/matrix.py`, `src/hakuba_api/ranking/{rank,router,models}.py`, `tests/ranking/test_rank.py`
**Scope:** M

## Task 15: Web — 🚗 ranked list ✅
**Description:** The Drive tab: sort dropdown (7 keys), filters, date picker; a list with ETA, snow, an "estimated" crowd badge, and all factor values on expand (null shown as "—"); snow `asOf` shown. Selecting a resort draws its route (reusing T6). Sort/date/filters are kept in the URL. Open-Meteo is credited in the attribution.
**Acceptance criteria:**
- [x] Changing the sort reorders the list with no route flicker; the selected resort draws its drive route
- [x] Every estimate is labeled
**Verification:** Web gates; Playwright `e2e/drive.spec.ts`
**Dependencies:** T7, T14
**Files:** `src/components/{DrivePanel,ResortList,SortControls}.tsx`, `tests/ResortList.test.tsx`, `e2e/drive.spec.ts`
**Scope:** M

## Checkpoint D: Drive mode complete
- [ ] All gates green; all 7 sort keys verified in the UI
- [ ] Review with human

---

## Phase 5: Slice 4 — Bus

## Task 16: Bus source change detector ✅
**Description:** `bus.check_sources` fetches the shuttle page, collects the timetable JPG/PDF URLs and the line↔resort mapping, downloads to `data/bus/raw/<season>/` (gitignored), compares sha256 against `data/bus/sources.json`, and prints NEW/CHANGED/REMOVED; exit code 1 if anything changed. `--accept` writes the new manifest.
**Acceptance criteria:**
- [x] Fixture HTML with one changed hash → exit 1 listing it; an unchanged run → exit 0
- [x] The real page run produces a manifest with all current assets (E, F, G1-6, G7-10, H, I, L, N, O, R, T, V1, V2, VN + PDFs)
**Verification:** API gates; run against the live page
**Dependencies:** T1
**Files:** `src/hakuba_api/bus/check_sources.py`, `data/bus/sources.json`, `tests/bus/test_check_sources.py`, `tests/fixtures/hv/shuttle.html`
**Scope:** S

## Task 17: Bus stops + timetable schema + validator ✅
**Description:** `data/bus_stops.json` covering every stop on the shuttle lines (coordinates from OSM `highway=bus_stop` or set by hand, with `coordSource`), plus `servesResortId`. A Pydantic `Timetable` model (incl. `kind: day|night`, `reviewed`). Validator rules: known stop aliases, strictly increasing times per trip, consistent stop order, no overlapping periods per line, hash present in sources.json.
**Acceptance criteria:**
- [x] One failing unit test per validator rule, with a clear message
- [x] All stops in the V2 image resolve
**Verification:** API gates; `data.validate` exits 0
**Dependencies:** T4, T16
**Files:** `src/hakuba_api/bus/{models,validate}.py`, `src/hakuba_api/data/validate.py`, `data/bus_stops.json`, `tests/bus/test_validate.py`
**Scope:** M

## Task 18: Transcribe Line V (all periods) + Line VN
**Description:** In a Claude Code session, transcribe the V1/V2/other V period images and VN into `data/bus/timetables/2025-26/`. Run the validator, then the human compares each image with the git diff and sets `reviewed: true`.
**Acceptance criteria:**
- [x] Validator passes; V2 contains Cortina 09:00 → Goryu Escal Plaza 10:23 (southbound trip 2)
- [x] The human has reviewed every file (independent re-transcription, docs/review/timetables-2025-26.md; signed off 2026-10-29)
**Verification:** `data.validate`; human review
**Dependencies:** T17
**Files:** `data/bus/timetables/2025-26/line-v-*.json`, `line-vn.json`
**Scope:** S (data only)

## Task 19: Transcribe remaining lines
**Description:** Same process for E, F, G1-6, G7-10, H, I, L, N, O, R, T. Also check whether the season PDF has extractable text (record it in the Open Questions of `SPEC-bus-schedules.md`).
**Acceptance criteria:**
- [x] All lines transcribed, validated and reviewed (docs/review/timetables-2025-26.md) and reviewed; every resort in the page's line↔resort mapping can be reached by at least one line
**Verification:** `data.validate`; human review
**Dependencies:** T17
**Files:** `data/bus/timetables/2025-26/*.json`, `SPEC-bus-schedules.md`
**Scope:** M (data only; can be split by line if a session runs long)

## Task 20: Bus query + /api/bus/options + /api/bus/night ✅
**Description:** A pure `bus_options(origin_walks, at, timetables)`: candidate stops via the walk matrix (≤ 20 min, else the 3 nearest), active periods, direct trips only, the 3 earliest arrivals per resort. Out of season → `no_service` + `nextServiceDate`. The night endpoint uses only `kind: night` timetables. Only `reviewed: true` data is served.
**Acceptance criteria:**
- [x] Fixture V2, 2026-03-20 08:00, origin at the Happo Bus Terminal: first option to Hakuba47 = 08:11 → 08:39, the next = 09:48 → 10:16
- [x] Out-of-season date → `no_service`; unreviewed files are ignored
- [x] ≥ 90% coverage on `bus/query.py`
**Verification:** API gates
**Dependencies:** T14 (matrix), T17, T18
**Files:** `src/hakuba_api/bus/{query,router}.py`, `tests/bus/test_query.py`
**Scope:** M

## Task 21: Web — 🚌 bus tab + night toggle ✅
**Description:** Enable the Bus tab: a card per resort (walk to the stop, the next 3 departures with line badge, depart → arrive, wait), a departure time picker, a link to the source image, and the notices "may change without notice / buses can be full". Selecting an option draws the walk leg and highlights the stop. A night bus toggle. The `no_service` state. Hakuba Valley is credited in the attribution.
**Acceptance criteria:**
- [x] With the time set to 2026-03-20 08:00 at the Happo Bus Terminal, Hakuba47 shows 08:11 → 08:39
- [x] A current (off-season) date shows a clear no-service message
**Verification:** Web gates; Playwright `e2e/bus.spec.ts`
**Dependencies:** T7, T20
**Files:** `src/components/{BusPanel,BusOptionCard,NightBusToggle}.tsx`, `tests/BusPanel.test.tsx`, `e2e/bus.spec.ts`
**Scope:** M

## Checkpoint E: Complete
- [ ] Playwright `e2e/all-modes.spec.ts`: search "Hotel Hakuba" → each of the 3 tabs shows a result and a line on the map
- [ ] Attribution (OSM, OpenFreeMap, Open-Meteo, Hakuba Valley), keyboard navigation, AA contrast, and mobile at 390 px all verified
- [ ] Every SPEC.md success criterion is met
- [ ] Review with human

---

# v1.1 (2026-10-30) — see plan.md "v1.1 plan"

## Phase 6: Google-style routes

## Task 22: Routing — richer steps and route summary ✅
**Description:** Map the Valhalla maneuver `type` to a stable `maneuver` enum. Add `streetNames` and `shapeRange` to `Step`, and `summary` ("via X and Y", the longest named roads) to `Route`.
**Acceptance criteria:**
- [x] A table test covers Valhalla types 0–39, and unknown types → `straight`
- [x] `shapeRange` of consecutive steps tiles the geometry; the summary names the 1–2 longest roads
**Verification:** API gates; `curl /api/route` shows the new fields
**Dependencies:** None
**Files:** `routing/{models,client,maneuvers}.py`, `tests/routing/test_client.py`, a fixture
**Scope:** S

## Task 23: Routing — alternates and via-point paths ✅
**Description:** Add `GET /api/routes?…&alternates=0..2` → `RouteSet` (drop alternates > 1.5× the primary) and `POST /api/route/path {mode, points}` with Valhalla `through` locations (≤ 25 points).
**Acceptance criteria:**
- [x] A fixture with 1 alternate → length 1; a slow alternate is dropped
- [x] A path through 4 points passes within 50 m of each (live test, marked)
- [x] 404 / 503 error shapes match `/api/route`
**Verification:** API gates; `pnpm gen:api`
**Dependencies:** T22
**Files:** `routing/{router,client,models}.py`, `tests/routing/*`, `apps/web/src/lib/{api-types,api}.ts`
**Scope:** S

## Task 24: Web — Google-style route on the map ✅
**Description:** Fetch a `RouteSet`. Draw alternates (grey, below) and the primary (casing + line, dotted for walk); add ETA pills at the line centre, a blue-dot origin and a red-pin destination; fit the bounds with panel padding; tapping an alternate makes it the primary.
**Acceptance criteria:**
- [x] E2E: selecting Iwatake in Drive → the map bounds contain the route, a pill is visible, and clicking the alternate swaps the primary
- [x] `data-route-layers` lists the drawn layers
**Verification:** Web gates; Playwright `e2e/route.spec.ts`; a screenshot checked in the browser
**Dependencies:** T23
**Files:** `MapView.tsx`, `MapShell.tsx`, `lib/route-geo.ts` (pill points, bounds), `tests/route-geo.test.ts`, `e2e/route.spec.ts`
**Scope:** M

## Task 25: Web — directions panel ✅
**Description:** `DirectionsPanel`: one option card per route (time, distance, "via …", selected state), "Arrive ~HH:MM", the estimate note, and a step list with lucide maneuver icons, street names and "300 m / 1.2 km" distances. It collapses after 5 steps, and hovering or focusing a step highlights its segment on the map.
**Acceptance criteria:**
- [x] Component tests: an icon per step, the distance format, the arrive time, and that selecting a card calls back
- [x] It replaces `RouteSummary` in Drive/Walk; bus mode is unchanged until T29
**Verification:** Web gates
**Dependencies:** T24
**Files:** `components/{DirectionsPanel,ManeuverIcon}.tsx`, `ModePanel.tsx`, `lib/format.ts`, `tests/DirectionsPanel.test.tsx`
**Scope:** M

## Checkpoint F
- [x] All gates; drive and walk checked in a real browser at desktop and 390 px; the console is clean

## Phase 7: Season-agnostic bus

## Task 26: Bus — projection to the requested date ✅
**Description:** The pure `effective_timetables(day, tables) -> (tables, basis)` per the SPEC v1.1 rule; `BusResult` gains `basis`, `basedOnSeason` and `newerSourcePending`; the night bus uses the same rule.
**Acceptance criteria:**
- [x] 2026-03-20 → published; 2027-01-15 → expected (same trips as 2026-01-15); 2026-07-01 → no_service, next 2026-12-19; Feb 29
- [x] `newerSourcePending` is true when sources.json's season > the latest transcribed season
- [x] Doubt-driven review of the rule and the copy
**Verification:** API gates; `curl /api/bus/options?at=2026-10-30T08:00…` → no_service with nextServiceDate; `at=2027-01-15T08:00` → expected
**Dependencies:** None
**Files:** `bus/{season,query,router}.py`, `tests/bus/test_season.py`
**Scope:** M

## Task 27: Bus — regular refresh ✅
**Description:** `check_sources` prints `NEW SEASON <S>`. The workflow gets the daily Oct–Jan and weekly Feb–Sep crons, a season-aware issue title, and a checklist body. `data.validate` checks manifest season ≥ transcribed season.
**Acceptance criteria:**
- [x] A page fixture naming the 2026-2027 PDF → `NEW SEASON 2026-27`, exit 1
- [x] Both crons are present; YAML parses (actionlint if available)
**Verification:** API gates
**Dependencies:** T26
**Files:** `bus/check_sources.py`, `tests/bus/test_check_sources.py`, `.github/workflows/timetable-watch.yml`, `data/validate.py`
**Scope:** S

## Task 28: Web — bus copy without years ✅
**Description:** Show the "Expected" badge and note, the newer-timetable notice, "Runs Dec 19 – Mar 29" for no-service, and remove "This season's".
**Acceptance criteria:**
- [x] A component test: no `/\b20\d\d\b/` in the rendered panel for every status
- [x] The Expected badge is shown only when `basis === "expected"`
**Verification:** Web gates
**Dependencies:** T26
**Files:** `BusPanel.tsx`, `tests/BusPanel.test.tsx`, `e2e/fixtures/*`
**Scope:** S

## Task 29: Bus journey on the map ✅
**Description:** `BusOption.rideStops`. The web fetches `POST /api/route/path` (drive) through the located ride stops and draws walk (dotted) + ride (line colour) + stop dots, with the "approximate bus path" label. A timeline in the selected option.
**Acceptance criteria:**
- [x] A query unit test: rideStops goes from board to alight in order, with times
- [x] E2E: a bus option → `data-route-layers` contains walk and ride; the timeline shows board and arrival times
**Verification:** API + web gates; Playwright `e2e/bus.spec.ts`; browser screenshot
**Dependencies:** T23, T24, T28
**Files:** `bus/query.py`, `tests/bus/test_query.py`, `BusPanel.tsx`, `MapView.tsx`, `MapShell.tsx`, `e2e/bus.spec.ts`
**Scope:** M

## Checkpoint G
- [x] Today's date returns a clear answer; an in-season future date shows Expected times; the journey is drawn; all gates

## Phase 8: Food & konbini destinations

## Task 30: POI snapshot ✅
**Description:** The `pois` package: a `Poi` model, `refresh_pois` (Overpass, the lodging bbox, the category mapping), `data/poi_osm.json`, and validator rules.
**Acceptance criteria:**
- [x] A fixture → both categories, unnamed dropped, way centres used
- [x] The live snapshot has ≥ 10 konbini and ≥ 50 food places; `data.validate` OK
**Verification:** API gates; `python -m hakuba_api.data.validate`
**Dependencies:** None
**Files:** `pois/{models,refresh_pois}.py`, `data/poi_osm.json`, `data/validate.py`, `tests/pois/test_refresh.py`
**Scope:** M

## Task 31: POI nearby API ✅
**Description:** `GET /api/pois/nearby?from&category&mode&limit`: the 25 nearest by straight line → matrix → sort by ETA, with a 10-minute cache.
**Acceptance criteria:**
- [x] Sorted by duration and limited; unknown category → 422; Valhalla down → 503
**Verification:** API gates; `pnpm gen:api`
**Dependencies:** T30
**Files:** `pois/{router,query}.py`, `main.py`, `tests/pois/test_nearby.py`, `apps/web/src/lib/{api-types,api}.ts`
**Scope:** S

## Task 32: Web — destination picker ✅
**Description:** A `Resorts | Food | Konbini` segmented control in Drive/Walk; a POI list (name, brand/cuisine, ETA, distance, hours); selecting one routes to it with T24/T25; URL `dest=` / `cat=` (the old `resort=` is still read).
**Acceptance criteria:**
- [x] E2E: Konbini in Walk → sorted list → select → dotted route + pill
- [x] URL round-trip test for `dest=poi:…`
**Verification:** Web gates; Playwright
**Dependencies:** T25, T31
**Files:** `components/{DestinationPicker,PoiList}.tsx`, `MapShell.tsx`, `lib/url-state.ts`, `tests/*`, `e2e/poi.spec.ts`
**Scope:** M

## Checkpoint H: v1.1 complete ✅
- [x] All gates + full E2E; browser check of all flows at desktop and 390 px; the console is clean
- [x] SPEC success criteria 4, 6 and 7 met
- [ ] Review with human

## Phase 9: Google-style search (SPEC-place-search v1.2)

## Task 33: Search index and scoring ✅
**Description:** `places/index.py`: entries from stops, resorts (+ base areas), lodging and POIs; normalisation (NFKC, casefold, katakana→hiragana); scoring and ranking with `near`; `match` span.
**Acceptance criteria:**
- [x] The spec's index unit tests pass (tokyu / 白馬東急 / happo bus / 7-eleven / near-ranking / typo)
- [x] Pure: no I/O in `score`/`rank`; loaders injected
**Verification:** API gates
**Dependencies:** None
**Files:** `places/index.py`, `places/models.py`, `tests/places/test_index.py`
**Scope:** M

## Task 34: `/api/places/suggest` with Photon fallback; lodging keeps Japanese names ✅
**Description:** Endpoint with `near`; Photon appended only when < 3 local hits (≥ 3 chars), de-duplicated, failures swallowed. `refresh_lodging` keeps `name:ja`; snapshot refreshed.
**Acceptance criteria:**
- [x] respx: ≥ 3 local hits → no Photon call; Photon down → 200 with local hits
- [x] `data/lodging_osm.json` entries carry `nameJa` where OSM has it
**Verification:** API gates; `pnpm gen:api`
**Dependencies:** T33
**Files:** `places/router.py`, `places/refresh_lodging.py`, `places/models.py`, `tests/places/test_suggest.py`, `data/lodging_osm.json`
**Scope:** M

## Task 35: Web — suggestion dropdown ✅
**Description:** `SearchBox` uses `/suggest` with the map centre; icon per kind, bold match, detail line, recents on focus, Enter = top; 150 ms debounce.
**Acceptance criteria:**
- [x] Component tests: bold match, icon per kind, recents stored/shown, Enter picks top
- [x] E2E search spec passes against the new endpoint; 390 px no horizontal scroll
**Verification:** Web gates; Playwright
**Dependencies:** T34
**Files:** `components/SearchBox.tsx`, `lib/api.ts`, `lib/recent-searches.ts`, `MapShell.tsx`, `tests/SearchBox.test.tsx`, `e2e/search.spec.ts`
**Scope:** M

## Checkpoint I ✅
- [x] Typing a known hotel/stop/resort in EN or JA finds it instantly; the console is clean

## Phase 10: Saved places (SPEC-saved-places v1.3)

## Task 36: Saved store ✅
**Description:** `lib/saved-places.ts`: types, built-in lists, add/remove/move, the hotel label, limits, validated load/save with a corrupt-value backup and in-memory fallback, cross-tab `storage` sync, `useSaved()` hook.
**Acceptance criteria:**
- [x] Unit tests for every rule in the spec's first acceptance bullet
**Verification:** Web gates
**Dependencies:** None
**Files:** `lib/saved-places.ts`, `tests/saved-places.test.ts`
**Scope:** S

## Task 37: Save button, list picker, map layer ✅
**Description:** ☆/★ `SaveButton` on the origin, resort, POI, pin and bus-stop cards → `ListPicker` sheet (ticks, + New list, Set as My hotel); saved icons layer in `MapView`; tapping one selects it.
**Acceptance criteria:**
- [x] Component tests: toggle in/out of lists, new list, hotel label moves
- [x] E2E: star a searched hotel → reload → still ★
**Verification:** Web gates; Playwright
**Dependencies:** T36
**Files:** `components/SaveButton.tsx`, `components/ListPicker.tsx`, `MapView.tsx`, `MapShell.tsx`, `e2e/saved.spec.ts`
**Scope:** M

## Task 38: Saved panel, Go here, My hotel, search boost ✅
**Description:** "Saved" chip → lists → places with Start from here / Go here / note / remove / hide list; `dest=pt:` in URL state and as a route target; My hotel as the default origin; saved matches first in `SearchBox`.
**Acceptance criteria:**
- [x] url-state round-trips `dest=pt:`; SearchBox shows saved first
- [x] E2E: Go here draws a route; My hotel opens as the origin
**Verification:** Web gates; Playwright
**Dependencies:** T37
**Files:** `components/SavedPanel.tsx`, `lib/url-state.ts`, `SearchBox.tsx`, `MapShell.tsx`, tests
**Scope:** M

## Task 39: Share / import link ✅
**Description:** Encode a list as `#import=<base64url>`; on load, show an import confirmation with a preview; validate and limit to 200 places; clear the fragment afterwards.
**Acceptance criteria:**
- [x] Unit: round-trip and rejection cases
- [x] E2E: confirm imports, cancel stores nothing
**Verification:** Web gates; Playwright
**Dependencies:** T38
**Files:** `lib/saved-share.ts`, `components/ImportDialog.tsx`, `MapShell.tsx`, tests
**Scope:** S

## Checkpoint J ✅
- [x] All gates; saved flows E2E; 390 px check; clean console

## Phase 11: Pilot (SPEC-pilot v1.3)

## Task 40: Nav core ✅
**Description:** `lib/nav/`: `project`, `progress`, `NavSession` reducer (following/offRoute/rerouting/arrived), `cameraFor`. Pure.
**Acceptance criteria:**
- [x] Every unit bullet in SPEC-pilot's acceptance criteria, using the recorded Valhalla route fixture
**Verification:** Web gates
**Dependencies:** None
**Files:** `lib/nav/{project,progress,session,camera}.ts`, `tests/nav/*.test.ts`, fixture
**Scope:** M

## Task 41: Position sources, wake lock, `dev:https` ✅
**Description:** `PositionSource` (geolocation watch; dev-only simulated replay); `useWakeLock`; permission/insecure-context errors; `pnpm dev:https` script and README note.
**Acceptance criteria:**
- [x] Unit: the simulated source emits fixes along a route at the given speed; errors map to UI states
- [x] `pnpm dev:https` serves over HTTPS on the LAN address (verified: 200 on 127.0.0.1 and 192.168.50.158:3443, /api proxied; self-signed, nothing installed)
**Verification:** Web gates; manual `curl -k`
**Dependencies:** T40
**Files:** `lib/nav/position.ts`, `lib/wake-lock.ts`, `package.json`, README
**Scope:** S

## Task 42: Pilot screen (drive/walk) ✅
**Description:** Start button in `DirectionsPanel`; `PilotView` (banner, bottom bar, exit, re-centre, mute placeholder); `MapView` follow camera, puck, covered/remaining split; `data-nav-*` attributes for tests.
**Acceptance criteria:**
- [x] E2E: Start → banner → fixes along the route → remaining falls → arrival (+ drag pauses follow, Re-centre)
- [x] Location denied → message; Exit restores the overview
- [x] Found in E2E: routes start on the nearest road, so the first fix is often outside the 20 m walk radius → *approach* phase (≤ 150 m walk / 250 m drive before the first match is "Head to the route", not off-route)
**Verification:** Web gates; Playwright at desktop and 390 px
**Dependencies:** T41
**Files:** `components/PilotView.tsx`, `DirectionsPanel.tsx`, `MapView.tsx`, `MapShell.tsx`, `e2e/pilot.spec.ts`
**Scope:** M

## Task 43: Reroute ✅
**Description:** On `offRoute`, fetch a route from the current fix; throttle 10 s; failure keeps the old route with a message.
**Acceptance criteria:**
- [x] Unit: throttle and failure handling; E2E: off-route fixes → "Rerouting…" → new route starts at the fix
**Verification:** Web gates; Playwright
**Dependencies:** T42
**Files:** `lib/nav/session.ts`, `components/PilotView.tsx`, `MapShell.tsx`, tests
**Scope:** S

## Task 44: Voice and vibration ✅
**Description:** `speechSynthesis` announcements at the spec's distances (each announced once), remembered mute, `navigator.vibrate` on turns; feature-detected.
**Acceptance criteria:**
- [x] Unit: announcement schedule fires once per threshold per maneuver; muted → none (+ e2e with a recorded speechSynthesis)
**Verification:** Web gates
**Dependencies:** T42
**Files:** `lib/nav/announce.ts`, `components/PilotView.tsx`, tests
**Scope:** S

## Task 45: Bus pilot ✅
**Description:** Journey phases walk → wait → ride → arrived; countdown; upcoming stops with scheduled times; "Get off … next stop" alert; "I'm on the bus" button.
**Acceptance criteria:**
- [x] Unit: phase transitions from time + fixes; E2E: the full journey with simulated fixes and a fixed clock
- [x] Found by E2E: Start before the walk route loaded → a step-less route crashed `progress` and blanked the page → `progress` handles step-less lines, bus Start waits for the walk route, and `app/error.tsx` catches anything else
**Verification:** Web gates; Playwright
**Dependencies:** T42, T44
**Files:** `lib/nav/bus-journey.ts`, `components/BusPilot.tsx`, `BusPanel.tsx`, `MapShell.tsx`, tests
**Scope:** M

## Checkpoint K ✅ (except the user's phone walk)
- [x] All gates + full E2E (29/29, twice at low load); 390 px checks; clean console (map.spec caught a render-time `new Date()` in useNow, fixed)
- [ ] User walks a short real route on their phone via `pnpm dev:https`
- [ ] Review with human

## Phase 12: Search quality: paste a Booking.com hotel (SPEC-place-search v1.3; runs before T41)

## Task 46: Evaluation set and harness ✅
**Description:** `tests/places/booking_eval.json` (29 names, expected coordinate or `absent`, reviewed) and `places/eval_search.py`, which prints the table and recall, wrong-hit counts. A pytest test pins the thresholds (offline: index only).
**Acceptance:** [x] Baseline recorded: offline index 10/25 present, 0 wrong (the 6 wrong came from Photon, checked in T48) **Dependencies:** none **Scope:** S

## Task 47: Query cleaning for hotel-site URLs and titles ✅
**Acceptance:** [x] Unit tests for Booking/Agoda/Expedia/Hotels.com/Trip.com URLs and title noise (Rakuten/Jalan URLs carry no name); eval 14/25 **Dependencies:** T46 **Scope:** S

## Task 48: Scoring v2 + Photon relevance gate ✅
**Acceptance:** [x] v1.2 index tests pass; [x] eval shows 0 wrong lodging hits (offline and live Photon); 15/25 **Dependencies:** T47 **Scope:** M

## Task 49: Overture lodging snapshot (+ dedupe vs OSM, attribution) ✅
**Acceptance:** [x] Fixture-tested refresh; [x] validator; [x] eval recall ≥ 85% of present (23/25 alone) **Dependencies:** T48 **Scope:** M

## Task 50: Kana → romaji and sound-key matching ✅
**Acceptance:** [x] Unit tests (トロイメライ ↔ Traumerei, カナディアンロッジ ↔ Canadian Lodge); [x] eval 25/25, 0 wrong **Dependencies:** T49 **Scope:** S

## Checkpoint L ✅
- [x] Eval thresholds met (25/25, 0 wrong); all gates; full e2e 23/23 incl. Booking.com paste

## Phase 13: Device gating (SPEC-pilot "Devices")

## Task 51: Pilot only on touch-first devices ✅
**Description:** `lib/device.ts` `usePilotAvailable()` (coarse primary pointer, reactive, SSR-safe; dev `?simulate` override). MapShell passes `onStart` to directions and the bus panel only when available. Pilot e2e run under mobile emulation; new desktop e2e asserts no Start.
**Acceptance criteria:**
- [x] Unit tests for the rules in SPEC-pilot "Devices" (mutation-checked)
- [x] E2E: desktop → no Start (directions, bus); mobile → all pilot journeys pass; running session survives a pointer flip
- [x] Real iPhone check over USB: coarse pointer, Start shown
- [x] Found on the way: dev:https phones got a page that never started (Next blocked its dev resources for LAN hosts) → allowedDevOrigins
- [x] Adversarial review (19 agents): 12 confirmed findings, 10 fixed, 2 accepted and documented
**Verification:** Web gates; full Playwright; iPhone via inspector
**Dependencies:** T42, T45
**Files:** `lib/device.ts`, `components/MapShell.tsx`, `tests/device.test.ts`, `e2e/pilot.spec.ts`, `SPEC-pilot.md`
**Scope:** S

## Task 52: Every bus stop, before and after Start ✅
**Description:** BusPanel Journey lists all ride stops with times; PilotView (walk leg) and BusPilotView (wait/ride) show the full list (passed/next/alight states); MapShell draws the bus line + stop dots during the whole bus journey.
**Acceptance:** component tests + bus e2e as in SPEC-pilot "Bus stops, before and after Start"
**Files:** `BusPanel.tsx`, `BusPilotView.tsx`, `PilotView.tsx`, `MapShell.tsx`, `lib/nav/bus-journey.ts`, tests, `e2e/pilot.spec.ts`
**Scope:** M

## Task 53: Map label font 404 ✅
**Description:** name a served font on our symbol layers; e2e for zoomed-in clean console.
**Files:** `MapView.tsx`, `e2e/map.spec.ts`
**Scope:** XS

## Task 54: iPhone polish: no zoom-on-focus, no browser-attribute hydration warning ✅
**Found on the real iPhone (USB inspector):** visualViewport.scale 1.14 after typing in search (14px input); hydration error from Chrome iOS's `__gcrremoteframetoken` on `<html>` (the dev overlay's "1 Issue").
**Acceptance:** [x] e2e 16px fields on touch / 14px on laptop; [x] e2e injected html attribute → no hydration error

## Task 55: Preview when far from the route ✅
**Acceptance:** see SPEC-pilot "Preview when you're far away". **Files:** `lib/nav/proximity.ts`, `lib/nav/use-reroute.ts`, `MapShell.tsx`, `DirectionsPanel.tsx`, `PilotView.tsx`, `BusPanel.tsx`, tests, `e2e/pilot.spec.ts`. **Scope:** M

## Task 52b: Review fixes for T52/T53 (20-agent adversarial review: 14 confirmed) ✅
- Loop lines (Line E: Iwatake → … → Iwatake) collapsed the stop list to one row and "arrived" at once → the ride ends at the *last* match of the alighting stop.
- A stop we can't place was marked passed early → it stays next until the placed stop after it is passed.
- A phone that slept on the bus couldn't catch up (5 km look-ahead) → the whole line.
- Map: route layers had no fixed order (bus line over the walk route, stop dots under the line) → always mounted + order re-applied on every style change; the walk route clears after the stop; arrival keeps the ride grey; no stale ride chip while piloting.
- Position puck intercepted drags 1 in 5 (couldn't pan from your own position) → pointer-events none.
- Tests: >4-stop rides on every surface, exact row states, board/alight roles, waiting has no markings, scroll-into-view, loop and unplaced-stop cases, drawn layer order and rendered stop dots via the dev map handle, font test proves labels drew.

## Task 56: API: route through real stops (`stopAtPoints`) ✅
**Files:** `routing/client.py`, `routing/router.py`, `tests/routing/*`, fixture. **Scope:** S

## Task 57: Trip panel: clear boxes, add/remove stops, map tap fills the active box, stops in URL ✅
**Files:** `components/TripPanel.tsx` (replaces PlaceStrip), `MapShell.tsx`, `MapView.tsx`, `SearchBox.tsx`, `lib/url-state.ts`, `lib/api.ts`, tests, `e2e/stops.spec.ts`. **Scope:** M

## Task 57b: Trip stops review fixes ✅
Adversarial review (3 reviewers + verifier): 19 confirmed, all fixed. Empty stop box had no ✕ and took every map tap (also hidden, or while navigating); clearing From stranded stops; bus-mode To ✕ wiped the drive destination; frozen "Stop N" names; no ✕ on From; Valhalla "destination" wording at each stop; reroute renumbering and stop list cut before a failed reroute; no reach tolerance; URL junk (Number("") = 0) and no stop cap; resort/saved marker taps while placing; stop circles fell through to the map and sat under route chips; phone sheet didn't expand for a stop box; hint covered by the dropdown; focus lost on fill/remove; tests that passed without testing (bus rule, route-line rule, fill).
**Known flake (pre-existing, not from T57):** `pilot.spec.ts` "start, follow the walk…" failed ~1 in 4 when several copies ran in parallel: the drag never showed Re-centre. Fixed in T58.

## Task 58: A swipe on the navigation map is never lost ✅
Root cause (MapLibre source): `easeTo()` calls `_stop(false)` → `_stopHandlers()`, which cancels a gesture in progress. The follow camera eases at map load and on every GPS fix, so a swipe that began just before one did nothing. Fix: the follow camera waits while the map is pressed (map `mousedown`/`touchstart`, wired at map creation; released on window `pointerup`/`pointercancel`/`blur`) and catches up on release unless the press became a drag. New e2e presses, lets a fix arrive, then drags (failed 3/3 before, passes after). Every remaining reproduction began on the destination pin, so non-interactive markers (destination pin, start dot, bus label) now let presses through, like the puck. Walk test: 23/24 in parallel at load 25–54 (the one failure a 90 s timeout at load 47), full suite 47/47 with 2 workers at load ~15.


## Phase 14: Go public, Phase A (SPEC-deploy v1.5)

## Task 59: Hakuba-only Valhalla tiles, reproducible ✅
**Acceptance:** `infra/valhalla/build-hakuba.sh` builds `custom_files/hakuba/tiles.tar` from Geofabrik chubu (osmium bbox crop + admins + `default_speeds.json`); the dev compose serves it, bound to 127.0.0.1; a unit test proves every coordinate in `data/` lies inside the bbox with ≥ 5 km margin (the first box failed it: Otari lodgings 1 km from the edge); a live test compares 7 drive and walk pairs with the expected values. **Files:** `infra/valhalla/build-hakuba.sh`, `infra/docker-compose.yml`, `services/api/tests/routing/test_bbox.py`, live test. **Scope:** S

## Task 60: API rate limits + identify upstream ✅
**Acceptance:** global token buckets per upstream (Photon 1/s, Open-Meteo 1/s, Google short links 1 per 2 s) → 503 `upstream_busy`; per-client 120/min keyed on the hop our trusted proxy appended to `X-Forwarded-For` (`TRUSTED_PROXY_HOPS`; unset = off, since Next never adds one) → 429; cache hits spend nothing; `USER_AGENT` uses `PUBLIC_URL`. No new dependency. **Files:** `common/ratelimit.py`, `common/upstream.py`, `main.py`, upstream callers, tests. **Scope:** M

## Task 61: Production web: security headers, no indexing, e2e on `next start` ✅
**Acceptance:** `nosniff`, `Referrer-Policy`, `Permissions-Policy: geolocation=(self)`, `X-Frame-Options: DENY`; `/robots.txt` disallows all, plus a `noindex` meta tag; the e2e suite passes against a production build (`E2E_PROD=1`: 45 passed, 4 dev-only skipped; dev: 49/49). **Files:** `next.config.ts`, `app/robots.ts`, `app/layout.tsx`, `e2e/prod.spec.ts`. **Scope:** S

## Task 62: `scripts/serve-public.sh` (+ `--stop`) ✅
**Acceptance:** builds the web app, starts Valhalla + API + `next start`, waits for `/api/health`, then (only with `--funnel`) runs `tailscale funnel --bg 3000`; `--stop` turns Funnel off first, then stops the services. Refuses to publish if health fails. **Files:** `scripts/serve-public.sh`, SPEC-deploy commands. **Scope:** S

## Checkpoint M: Phase A ready
- [x] All gates green, the full e2e suite passes against `next start` (2026-11-02: `E2E_PROD=1` 79 passed, 5 dev-only skipped, 0 failed; dev 79 + the 5 load-timeouts in stops.spec 6/6 serial; unit 343; API 359, ruff, pyright, data OK. Fixed on the way: Task 67 pilot-drag flake; T73 double-click test needed `devOnly` (reads the dev map handle); small-phone layout check now waits for a settled layout, 111/112 after vs 14/16 before)
- [ ] With Funnel on, a request from a phone reaches the API with its address as the last `X-Forwarded-For` hop (then run with `TRUSTED_PROXY_HOPS=1`)
- [ ] The author installs Tailscale, renames the machine to `hakuba-map`, enables HTTPS + Funnel in the admin console
- [ ] **Ask before** turning Funnel on; then a phone on mobile data runs search → bus/drive/walk → Start

## Phase 15: Game theme (SPEC-game-theme v1.6)

## Task 63: Theme foundation: font, tokens, frames ✅
**Acceptance:** DotGothic16 via `next/font/google` replaces Geist; snowy theme tokens (cream panels, ink text, pine/ice/amber accents) with a unit test that every text/background pair is ≥ 4.5:1; CSS utilities `.pixel-frame` (stepped border, no images) and chunky pressable buttons, applied to the sheet/panels and shadcn buttons; every e2e test passes unchanged. **Files:** `app/layout.tsx`, `app/globals.css`, `lib/game/tokens.ts`, `components/ui/button.tsx`, tests. **Scope:** M

## Task 64: Sprites in code + world numbers ✅
**Acceptance:** sprite format (palette + rows of indices) and a canvas renderer (pixelated, cached); hero poses idle/walk/ride/bus/drive with the frame counts in the spec, mirrored for facing; icons: world badge, stop sign, konbini, food, star, flag; `worldNumbers(resorts)` W1–W10 north → south. Tests: every frame's size and palette indices, pose table, world numbering complete and stable. **Files:** `lib/game/sprites.ts`, `lib/game/render.ts`, `lib/game/worlds.ts`, tests. **Scope:** M

## Task 65: Game-styled map ✅
**Acceptance:** `gameStyle(base)` changes paint only (test: every layer id, source, layout kept); MapView loads it; resort/stop/POI/saved/destination markers use the sprites; routes are dotted trails (active thick dashed, alternates thin grey); labels keep a dark halo. **Files:** `lib/game/map-style.ts`, `MapView.tsx`, tests. **Scope:** M
**Done:** the base style is fetched once and recoloured (`useGameStyle`; falls back to the plain URL); forests are a pale snowy tint (pine at 35% turned the forested valley grey); the chosen route is an ink path with gold dashes (round caps add a line width to each dash, so a solid casing shows through as the path), walking is ink footprint dots, alternates dashed grey without a casing; resort chips carry the world badge, the bus stop and destination are sprites, the chosen resort's chip sits above the flag. **Not done, on purpose:** saved-place markers keep their list's icon (star/heart/flag/bookmark tell lists apart); konbini/food sprites wait for the level cards (T72): the map has no POI markers today. One full-suite run had the walk pilot test fail once at load 5.6; it didn't reproduce (3/3 alone, 28/28 pilot file ×2 in parallel, then 49/49).

## Task 66: The hero on the map ✅
**Acceptance:** while navigating, the hero sprite replaces the puck: pose from the mode (walk/drive/bus legs), facing from the bearing (mirrored, never rotated), accuracy circle kept; planning shows the idle hero at the start; reduced motion → static frame. **Files:** `components/HeroMarker.tsx`, `MapView.tsx`, `PilotView`/`BusPilotView` wiring, tests. **Scope:** M
**Done:** `heroPose` (drive/walk while navigating, bus journey: walk → idle while waiting → bus → ride on arrival); `facesLeft` from heading relative to the map's bearing (heading-up reads "right"), mirrored never rotated; anchored at the feet; 48 px while navigating, 36 px idle at the start while planning (navigating keeps the small start dot: one hero on screen). Today's puck had no accuracy circle, so there is none to keep.

## Task 67: Chiptune sound ✅
**Acceptance:** `sfx.ts` synthesises select/confirm/stamp/quest/bus/offRoute with Web Audio; muted by default; a speaker toggle saved in `hakuba:sound`; no AudioContext before an unmuted gesture; wired to tab/card choice, Start, next bus, off-route. Tests with a fake AudioContext. **Files:** `lib/game/sfx.ts`, `components/SoundToggle.tsx`, wiring, tests. **Scope:** M
**Done:** effects as note lists (square/triangle, 5 ms attack, exponential release, no files); the speaker toggle sits on the Saved row until the HUD (T72); `select` on mode tabs and resort choice, `confirm` on Start, `bus` when the journey reaches the ride (boarding: the app has no "next bus is coming" signal), `offRoute` on leaving the route. e2e counts real AudioContexts: none while muted, one on the tap that turns sound on, none after a reload until the next tap.
**Open issue (pre-existing, not from v1.6):** `pilot.spec.ts` "start, follow the walk…" fails ~1 in 4 when 4 copies run at once (load ~8): the drag doesn't stop following, so Re-centre never shows. A/B on 2026-11-01: T62 code 9/12, current 9–10/12, with the hero animation frozen 10/12; nothing covers the press point (only the canvas is under it). So T58's "never lost" holds for one run at a time, not under this concurrency. Next step when picked up: trace MapLibre's `dragstart` vs the follow camera under CPU throttling.
**Investigation 2026-11-01 (unfinished):** real test still fails 6/16 at 4 workers, load ~30–40 (4 = no Re-centre). A diagnostic copy of the same steps passed 28/28: the follow camera's ease always ran (movestart, no user) seconds before the press, and every press gave a user `dragstart`. So the failing runs must differ in timing between the fix and the press. Instrumentation note: `window.__hakubaMap` is react-map-gl's MapRef (bound method copies, no `isEasing`); hook `getMap()` for the real instance. Candidate hypothesis to test next: `pressing` is React state, so a follow-camera passive effect committed before the press can flush after mousedown and `easeTo` cancels the drag; a ref set synchronously on press would close that gap. Diagnostic spec kept outside the repo.
**Fixed 2026-11-02:** root cause confirmed with page-start logging: in a failing run the navigation map loaded 220 ms before the press, and a non-user `movestart` began 3 ms after `pointerdown` (the follow ease inside the press; no `dragstart`). The press handler's `setPressing(true)` made React flush the still-pending follow effect first, with the old `pressing = false`. Fix: a ref set synchronously on press is the guard (state still re-runs the effect on release). Red-first unit test `tests/MapView.follow.test.tsx` presses in that window (mock map's layout effect). A/B at load ~14: unfixed 15/16, fixed 48/48. Debugging note: this MapLibre has no `isEasing()` (use `isMoving()`), and react-map-gl copies `easeTo` onto its ref at creation, so patching it later is bypassed.

## Checkpoint N: Game theme ✅
- [x] All gates green; e2e dev 51/51 (49 + 2 new) apart from the open pilot-drag flake; `E2E_PROD=1` 47 passed, 4 dev-only skipped; screenshots reviewed on desktop and an iPhone 13 viewport (production build)

## Phase 16: Progression (SPEC-progression v1.6)

## Task 68: Rider store + titles ✅
**Acceptance:** `hakuba:rider` validated store (corrupt → empty + raw kept; storage throws → session only), `useSyncExternalStore`, tab sync, rename (≤ 20 chars), titles at every threshold. **Files:** `lib/game/rider.ts`, tests. **Scope:** S

## Task 69: Stamps: arrival and check-in ✅
**Acceptance:** a pilot arrival within 150 m of a resort access point stamps it (200 m doesn't); "Check in" on a resort card takes one fix: ≤ 300 m and accuracy ≤ 100 m counts, else the distance or accuracy message; one visit per JST day; the stamp moment (dialog, sound, aria-live); no position stored. **Files:** `lib/game/stamps.ts`, `ResortList.tsx`, pilot arrival hook, `components/StampMoment.tsx`, tests, e2e. **Scope:** M

## Task 70: Quests + stats ✅
**Acceptance:** `questsFor(date, rider, resorts, snow)` deterministic (powder ≥ 10 cm biggest, none without snow data; new world; konbini break), ≤ 3, expire at JST midnight; done by visits/trips; quest log; km by mode and trips from pilot trips only. **Files:** `lib/game/quests.ts`, `lib/game/stats.ts`, `components/QuestLog.tsx`, tests. **Scope:** M
**Done:** a day's set is saved the first time it's made (else earning the stamp would swap "Explore X" for the next world); details travel in the quest id; powder uses the snow API's past-24 h fresh snow; new world uses world order (drive-time order is supported but not wired yet: the ranking lives in the drive panel); konbini by chain name (EN/JA) on a stop or a convenience destination. Stats at arrival (route km; bus = distance along the line) or at exit (distance covered, no trip). The clock is read after mount (`useNow`): `new Date()` while rendering is an unstable value under Cache Components (caught by the clean-console e2e).

## Task 71: Rider card + share + reset ✅
**Acceptance:** card with name, title, W1–W10 stamp grid, stats, quests; `#rider=` read-only share (round-trip; tampered/oversized rejected); reset behind confirm. **Files:** `components/RiderCard.tsx`, `lib/game/rider-share.ts`, tests. **Scope:** S
**Done:** card dialog (rename, title, W1–W10 stamp grid greyed until stamped, stats, today's quests, share, two-step reset that keeps the name); `#rider=` opens a read-only card (nothing imported; no visit dates in the link; tampered, oversized and malformed codes rejected with a message). Found and fixed a hydration mismatch: a sprite's data URL needs a canvas, so `PixelSprite` now renders without a source on the server and during hydration (sprites used to be client-only on the map, so it never showed before the rider button).

## Phase 17: The adventure (SPEC-web-app v1.6)

## Task 72: Title screen, HUD, level select ✅
**Acceptance:** title screen once per session (skipped by shared links and `?skip-title`, keyboard-operable, reduced motion); HUD with name, title, stamps n/10, quest badge, sound toggle; resort cards as level cards with world badge and stamp state in any sort order. **Files:** `components/TitleScreen.tsx`, `components/Hud.tsx`, `ResortList.tsx`, `MapShell.tsx`, tests, e2e. **Scope:** M
**Done:** "seen the title" is a session cookie (`hakuba_title`): once per browser session, and Playwright's config presets it so every existing test runs unchanged (`e2e/title.spec.ts` clears it). Skipped for `from`/`resort`/`dest`/`skip-title` and `#import`/`#rider`; Enter or a tap starts; reduced motion hides the snow and stops the blink. HUD = the panel's top row: rider (name, title, ★ n/10) → rider card, quest log with its open count, sound. Level cards: world badge, "World N", ★ stamped / ☆ not yet; numbers stay with each resort in any sort order (e2e).

## Task 72b: Review fixes for v1.6 (3 reviewers + verifier: 15 confirmed, 1 refuted) ✅
- **High:** a far-away **preview** (simulated fixes) reached the resort and earned its stamp, quests and km: tapping Start in Tokyo could collect every stamp. Only real-GPS trips count now (not preview, not `?simulate`); e2e failed on the old code, passes now.
- **High:** a **bus journey** counted at the boarding stop (the pilot route is only the walk there), so arriving by bus never stamped and bus km stayed 0. `journeyArrived` waits for the bus; the bus-journey e2e now checks bus km (0 on the old code).
- Starting at the stop counted the bus line again as walking (`tripKm`, `walkIsLine`); the konbini quest read live planner state instead of the trip as started; the off-route chime could play on the bus or in a preview; after Reset, today's quests stayed empty.
- Accessibility: focus ring 1.6:1 → dark amber ≥ 3:1 (tested); rider-card dialog traps Tab and returns focus; title screen keeps Tab on its button and hands focus to search; the blink stays ≥ 4.5:1; stamp status is the badge's own alt text; level cards show the Japanese name.
- Copy: the share notice said "no visit dates", but the first-stamp day travels; now it says exactly what is shared.
- Spec decisions recorded: no dark mode exists, so no night palette in v1.6; the konbini quest is offered every day (it only finishes on a navigated trip).
- Test bug found on the way: `name: "OK"` matched the HUD's "R**ook**ie" label (Playwright names are case-insensitive substrings) → `exact: true`.

## Checkpoint O: v1.6 done
- [x] Gates green; unit 320; e2e dev 61/62 (the one failure is the open pre-existing pilot-drag flake, Task 67); `E2E_PROD=1` 57 passed, 4 dev-only skipped (before the review fixes)
- [x] Adversarial review (3 lenses + refuting verifier): 15 confirmed, all fixed (Task 72b)
- [ ] Phone check over the dev HTTPS server: needs the author's iPhone (title, HUD, check-in at a base, stamp moment, sound toggle)

## Phase 18: Device QA fixes (from the 2026-11-01 QA: real iPhone over USB, Android emulation, desktop + API)
Done 2026-11-01 (T73–T78, each red-first; 332 unit, 84 e2e, 359 API green). Not yet re-checked on the real iPhone. Evidence: QA reports in the session, screenshots were in the session scratchpad (gone).

## Task 73: Double-click zoom must not move the start
Desktop: double-clicking the map zooms AND calls `onPickOrigin` (MapView.tsx map `onClick`, no dblclick guard) → the hotel start is lost. Fix: ignore the click that belongs to a double-click (e.g. defer single-click ~250 ms / check `originalEvent.detail`). **Scope:** S
**Done:** a pick waits out a 300 ms double-click window; a second click or dblclick cancels it.

## Task 74: Sheet handle swipe on touch
Android (emulated): a swipe on the BottomSheet handle does nothing (it only reads `onClick`; no click after a moving touch). Support drag up/down via pointer events; keep tap-to-toggle and keyboard. **Scope:** S
**Done:** the swipe acts on pointerup (pointer capture, pointercancel); a mouse drag's trailing click is ignored for 400 ms.

## Task 75: Touch targets ≥ 44 pt / 48 dp
Real iPhone: a tap on the HUD Rider button registered on the Quests button next to it (HUD buttons 32×32, tight). Also mode/category tabs 25 px tall, Check in 24 px, Details 16 px, Saved 26 px, ✕/star 28–32 px, MapLibre zoom 29 px. **Scope:** M
**Done:** one `(pointer: coarse)` rule in globals.css (44×44 for buttons, tabs, summaries, fields, checkbox labels; MapLibre controls); the sheet handle and ⓘ grow their hit area instead. Map markers and inline links exempt. e2e sweep: `e2e/touch-targets.spec.ts`.

## Task 76: Back closes overlays instead of leaving the trip
Android/desktop: Back with the rider card (or quest log) open navigates away and loses from/resort (URL mirror uses `replaceState` only). Push a history entry while an overlay is open; popstate closes it. Decide whether resort selection should push history. **Scope:** M
**Done:** `lib/back-close.ts` (`useBackToClose`, `mirrorUrl`). Decided: resort selection does not push history (✕ undoes it; an entry per pick would flood Back). Closing an overlay calls `history.back()` async, so tests that reload right after must wait (see saved.spec).

## Task 77: Small phones: Start/ETA visible in the collapsed sheet
At 360×740 / Pixel 7 walk, Start and ETA are below the collapsed sheet's fold. Also "Tap to start" expands the sheet and focuses search (may raise the keyboard on Android): don't auto-focus search on touch. **Scope:** S
**Done:** the ETA row is sticky to the sheet's bottom while below the fold; title start focuses the sheet on touch.

## Task 78: Keyboard + API hygiene
- Skip link / tab order: 20 map stops (markers, attribution) before the search box.
- `/api/bus/options` and `/api/bus/night` 500 on extreme dates (9999-12-31, 0001-01-01) → 422; clamp the date input (min/max).
- Request size limit (a 5 MB POST is parsed and echoed in the 422 body); cap `q` length.
- `/api/resorts` fetched twice per load; Cache-Control on static API data.
- Polish: cut-off search placeholder, desktop title says "Tap to start", "Stamp earned!" announced twice (toast + output), hero covers the Happo-One map label, no h1, Escape doesn't dismiss the stamp toast.
**Scope:** M
**Done:** API: dates 2000–2100 (422), 64 KB body limit (413), 422 without the input echo, `q` ≤ 2048, /api/resorts cached 1 h. Web: date min/max + clamp, one resorts fetch, map after the sheet in the DOM (Tab → search first), sr-only h1, "Checked in" + Escape on the stamp toast, shorter hints, "Press start", resort labels above the idle hero.

## Task 79: Pulling the sheet down reloads the page on iPhone (backlog)
From the 2026-11-01 real-iPhone re-check: dragging the sheet/panel down to collapse it can trigger Safari's pull-to-refresh and reload the trip. Approach it as a mobile UX task (iOS gesture conventions + UX research), not a one-line CSS patch: decide which areas own vertical drags (sheet handle, sheet body at scroll-top, map) and what a downward pull should mean there. Candidate mechanics: `overscroll-behavior-y` on the page/sheet, `touch-action` on drag areas, keeping the sheet's own scroll from chaining to the page. Verify on the real iPhone (pull-to-refresh can't be reproduced in Playwright). **Scope:** S–M
**Done:** the sheet owns a downward drag when its list is at the top (collapses; Safari never sees a pull) and an upward drag while collapsed (expands; the page no longer bounces), decided at touch start + first move, as in UIKit sheets (`prefersScrollingExpandsWhenScrolledToEdge`) and Vaul's `shouldDrag`. Native non-passive listeners in `BottomSheet.tsx`; `overscroll-behavior-y: none` on the root for Android Chrome (Safari ignores it, WebKit bug 275947). Verified on the iPhone with a touch logger: 0 reloads in 12+ downward drags.

## State at handoff (2026-11-01, after Phase 18)
- v1.6 game redesign (T63–T72b) and Phase 18 device QA fixes (T73–T78) done; ~30 commits local, NOT pushed (the user hasn't OK'd the push).
- Real-device re-check done 2026-11-01: T73–T77 all pass on the iPhone (via Personal Hotspot; home Wi-Fi blocks phone↔Mac) and the desktop checks pass in Chrome. Android not checked (no device).
- Pushed 2026-11-01 (9a25e4a, CI green). T79 done after that, local.
- Next: Checkpoint M once the user has installed Tailscale.
- Open issue: pilot walk-drag flake (Task 67 note).
