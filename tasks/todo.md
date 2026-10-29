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

## Task 33: Search index and scoring
**Description:** `places/index.py`: entries from stops, resorts (+ base areas), lodging and POIs; normalisation (NFKC, casefold, katakana→hiragana); scoring and ranking with `near`; `match` span.
**Acceptance criteria:**
- [ ] The spec's index unit tests pass (tokyu / 白馬東急 / happo bus / 7-eleven / near-ranking / typo)
- [ ] Pure: no I/O in `score`/`rank`; loaders injected
**Verification:** API gates
**Dependencies:** None
**Files:** `places/index.py`, `places/models.py`, `tests/places/test_index.py`
**Scope:** M

## Task 34: `/api/places/suggest` with Photon fallback; lodging keeps Japanese names
**Description:** Endpoint with `near`; Photon appended only when < 3 local hits (≥ 3 chars), de-duplicated, failures swallowed. `refresh_lodging` keeps `name:ja`; snapshot refreshed.
**Acceptance criteria:**
- [ ] respx: ≥ 3 local hits → no Photon call; Photon down → 200 with local hits
- [ ] `data/lodging_osm.json` entries carry `nameJa` where OSM has it
**Verification:** API gates; `pnpm gen:api`
**Dependencies:** T33
**Files:** `places/router.py`, `places/refresh_lodging.py`, `places/models.py`, `tests/places/test_suggest.py`, `data/lodging_osm.json`
**Scope:** M

## Task 35: Web — suggestion dropdown
**Description:** `SearchBox` uses `/suggest` with the map centre; icon per kind, bold match, detail line, recents on focus, Enter = top; 150 ms debounce.
**Acceptance criteria:**
- [ ] Component tests: bold match, icon per kind, recents stored/shown, Enter picks top
- [ ] E2E search spec passes against the new endpoint; 390 px no horizontal scroll
**Verification:** Web gates; Playwright
**Dependencies:** T34
**Files:** `components/SearchBox.tsx`, `lib/api.ts`, `lib/recent-searches.ts`, `MapShell.tsx`, `tests/SearchBox.test.tsx`, `e2e/search.spec.ts`
**Scope:** M

## Checkpoint I
- [ ] Typing a known hotel/stop/resort in EN or JA finds it instantly; the console is clean
