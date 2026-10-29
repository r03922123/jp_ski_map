# Implementation Plan: Hakuba Ski Map

## Overview
A Google-Maps-style web app for Hakuba Valley. Search for a hotel, then get 🚌 shuttle bus options, 🚗 resorts ranked by one chosen factor with a drive route, or a 🚶 walking route. Specs: [SPEC.md](../SPEC.md) and the `SPEC-<module>.md` files. The detailed tasks are in [todo.md](todo.md).

## Architecture Decisions
- **Monorepo, two apps.** `apps/web` (Next.js + MapLibre) and `services/api` (FastAPI). The web app only talks to `/api`, and its types are generated from OpenAPI, so neither side can drift silently.
- **Data lives in JSON files in git, not a database.** It is about 10 resorts, ~25 bus stops and ~14 timetables. Changes are reviewed as git diffs, and every load is checked by Pydantic.
- **Valhalla is self-hosted in Docker** on the Chubu OSM extract. ETAs are Valhalla's raw estimate with no winter multiplier.
- **Pure logic is kept separate from I/O.** Ranking, the crowd heuristic, the bus query and the validators are pure functions written test-first. Adapters (Valhalla, Photon, Open-Meteo, Overpass) are tested against recorded fixtures.
- **Each slice runs from the API through to the UI.** Walk and drive routes come first, then search, then conditions and ranking, then bus. That matches the approved build order.
- **No paid APIs.** Bus timetables are transcribed in Claude Code sessions and checked by the validator.

## Dependency Graph
```
scaffold(api, web) ─┬─ valhalla infra ── routing ──┬── web map+walk/drive ── search UI
                    │                              ├── matrix ── ranking ── web drive tab
                    ├─ resort-catalog ─────────────┤
                    │      ├─ snow ── crowd ───────┘
                    │      └─ bus stops ── timetable validator ── transcription ── bus query ── web bus tab
                    └─ place-search (photon, gmaps link, lodging snapshot)
```

## Task List (details in todo.md)

### Phase 1: Foundation
- [x] T1 Scaffold API service
- [x] T2 Scaffold web app with a base map
- [x] T3 Valhalla in Docker + live smoke test
- [x] T4 Resort catalog: models, validator, resorts.json

### Checkpoint A: Foundation
- [ ] All gates green; `/api/resorts` returns 10 resorts; the map shows resort markers; Valhalla answers a route

### Phase 2: Slice 1 — Walk & Drive routes
- [x] T5 Routing adapter + `/api/route`
- [x] T6 Web: map-click origin + 🚶/🚗 route to a selected resort
- [x] T7 Web: URL state + responsive panel/bottom sheet

### Checkpoint B: First usable flow
- [ ] Click map → pick resort → walk and drive routes with ETA drawn. Human review.

### Phase 3: Slice 2 — Search
- [x] T8 Photon search + Google Maps link parsing (`/api/places/search`)
- [x] T9 Lodging snapshot script + `/api/places/lodging`
- [x] T10 Web: search box + lodging pins

### Checkpoint C: Search
- [ ] Spot-check hotels findable (OSM ones by name, missing ones by link paste)

### Phase 4: Slice 3 — Conditions & Ranking
- [ ] T11 Snow conditions (Open-Meteo) + `/api/snow`
- [ ] T12 Spike: hakubavalley.com Weather & Snow page (time-boxed 1 h, findings only)
- [ ] T13 Crowd heuristic + `/api/crowd`
- [ ] T14 Matrix + ranking pure function + `/api/rank`
- [ ] T15 Web: 🚗 ranked list (sort, filters, date, factors)

### Checkpoint D: Drive mode complete
- [ ] All 7 sort keys work end-to-end. Human review.

### Phase 5: Slice 4 — Bus
- [ ] T16 Bus source change detector (`check_sources`)
- [ ] T17 Bus stops + timetable schema + validator
- [ ] T18 Transcribe Line V (V1, V2, …) + Line VN — review
- [ ] T19 Transcribe remaining lines (E, F, G1-6, G7-10, H, I, L, N, O, R, T) — review
- [ ] T20 Bus query + `/api/bus/options` + `/api/bus/night`
- [ ] T21 Web: 🚌 bus tab + night bus toggle

### Checkpoint E: Complete
- [ ] Playwright E2E covers all 3 modes; attribution, a11y and mobile checks pass; every SPEC success criterion is met. Human review.

## Parallelization
- Once T1/T2 are done: T3, T4, T8 and T9 are independent.
- Phase 5 data work (T16–T19) can start any time after T4 and doesn't block Phases 3–4.
- Everything else is sequential because each slice reuses the previous slice's UI.

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| **2026-27 timetables aren't published yet** (the site shows 2025-26; today is 2026-10-28) | High | Build and test on the 2025-26 data (the schema has `season`). `check_sources` flags the new season's images, and they're transcribed then. The UI shows `no_service` with the next service date until then. |
| Valhalla image or tile build is slow or fails on Apple Silicon | Med | T3 comes early (fail fast). Fall back to the `valhalla/valhalla` arm64 image or to building the tiles with Docker `--platform linux/amd64`. |
| Public Overpass/Photon are unreliable (Overpass already failed twice) | Med | Lodging is served from a snapshot. Photon is cached for 24 h. The link-paste and pin paths don't need either. |
| Transcription errors in timetables | Med | Validator (monotonic times, known stops, no overlapping periods) plus human git-diff review; `reviewed: true` is required before data is served. |
| The hakubavalley.com page layout changes | Low | `check_sources` fails loudly, and the per-asset hash list shows what changed. |
| The off-season makes snow/crowd hard to test live | Low | Everything is tested with recorded fixtures from last winter. Live tests are opt-in (`-m live`). |

## Open Questions
- "Best overall" combined ranking — research after v1 (see `SPEC-resort-ranking.md`).
- Real crowd data source — research backlog (see `SPEC-crowd-level.md`).
- Hosting — not needed for v1 (runs locally).
