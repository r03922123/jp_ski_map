# Spec: Hakuba Ski Map (jp_ski_map)

> Root spec. Holds the approved capability map and everything shared across modules.
> Each module has its own spec: `SPEC-<module-id>.md`. The map below is the index.
> Build status lives in [tasks/todo.md](tasks/todo.md). The checkboxes in the SPECs are not kept
> up to date as work lands (some are ticked, most are not), so read them as the bar to meet, not
> as progress.

## Objective

A Google-Maps-style web app for skiers staying in **Hakuba Valley** (Nagano, Japan).
The user searches for their hotel (or any place), then picks one of three transport modes:

| Mode | What the user gets |
|---|---|
| 🚌 **Bus** | Nearest Hakuba Valley shuttle stop(s), walk time to the stop, next departures, and arrival time at each reachable resort |
| 🚗 **Drive** | All resorts ranked by one chosen criterion (drive time, fresh snow, snow depth, crowd level, terrain size, vertical, price), with a route and ETA on the map for the selected resort |
| 🚶 **Walk** | Walking route and ETA to a selected resort (or bus stop) |

**Users:** the author and friends planning and doing Hakuba ski trips (v1). It is not a public commercial product yet.
**Scope v1:** the 10 Hakuba Valley resorts only (Jigatake, Kashimayari, Sanosaka, Goryu, Hakuba47, Happo-One, Iwatake, Tsugaike, Norikura, Cortina). The data model must not hard-code Hakuba, because more regions should fit in later.

## Capability Map (approved 2026-10-28)

| Module id | Responsibility | Depends on |
|---|---|---|
| `resort-catalog` | Resorts, base areas, bus stops (coords, names EN/JA), static stats | — |
| `place-search` | Search hotels/places → origin coordinate | — |
| `routing` | Valhalla wrapper: drive/walk route, ETA, one-to-many matrix | — |
| `snow-conditions` | Snow depth + new-snow forecast per resort (Open-Meteo; resort reports if parseable) | `resort-catalog` |
| `crowd-level` | Crowd estimate per resort per date (heuristic v1, pluggable source) | `resort-catalog`, `snow-conditions` |
| `bus-schedules` | Timetable ingestion (detect → transcribe → validate → git) + "next bus to resorts" query | `resort-catalog`, `routing` |
| `resort-ranking` | Single-criterion ranking of resorts from an origin | `resort-catalog`, `routing`, `snow-conditions`, `crowd-level` |
| `poi-destinations` | Restaurant & convenience-store destinations (OSM snapshot) + nearby-by-ETA query *(added v1.1, 2026-10-30)* | `routing` |
| `saved-places` | Starred/saved places and lists in browser storage, "My hotel" label, share links *(added v1.3, 2026-10-30)* | — (browser only) |
| `pilot` | Turn-by-turn navigation from live GPS: snapping, progress/ETA, off-route reroute, bus journey guidance *(added v1.3, 2026-10-30)* | `routing`, `bus-schedules` |
| `game-theme` | Original game look and sound: game-styled map, pixel snowboarder hero, world badges W1–W10, dialog/level-card frames, chiptune effects (Web Audio), DotGothic16 *(added v1.6, 2026-10-31)* | — (browser only) |
| `progression` | Rider profile on the device: resort stamps from real visits, daily powder quests, ride stats, rider card share link *(added v1.6, 2026-10-31)* | `resort-catalog`, `snow-conditions`, `pilot` |
| `web-app` | Map UI: search, 🚌/🚗/🚶 tabs, route lines, panels; from v1.6 presented as the adventure | all of the above (via HTTP API only) |
| `deploy` | Zero-cost hosting: Phase A this Mac + Tailscale Funnel, Phase B Vercel Hobby with Valhalla in the API (live 2026-11-10, ADR-0006) *(added v1.5, 2026-10-31)* | hosts every server module |

**Build order:** `resort-catalog` → `place-search`, `routing` → `web-app` (🚶 + 🚗 route) → `snow-conditions`, `crowd-level` → `resort-ranking` → `bus-schedules` + 🚌 tab
**v1.6 build order:** `game-theme` → `progression` → `web-app` wiring

Dependency arrows point one way. `web-app` talks only to the HTTP API and never imports backend modules.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router, latest stable, version pinned at scaffold) + TypeScript (strict), MapLibre GL JS via `react-map-gl/maplibre`, Tailwind CSS + shadcn/ui, TanStack Query |
| Base map | OpenFreeMap vector tiles (`https://tiles.openfreemap.org/styles/liberty`); Protomaps PMTiles is the fallback |
| Game theme (v1.6) | DotGothic16 (OFL) via `next/font/google`, self-hosted at build; sprites, map restyle and chiptune effects written in code (no game engine, no asset files) |
| Backend | Python 3.12+, FastAPI, Pydantic v2, httpx; managed with `uv` |
| Routing | Valhalla (Docker `ghcr.io/valhalla/valhalla-scripted:3.9.1`) built from the Geofabrik `asia/japan/chubu-latest.osm.pbf` extract, cropped to the Hakuba valley (`infra/valhalla/build-hakuba.sh`, v1.5) |
| Geocoding / POI | Photon (komoot) for text search, Overpass API for `tourism=hotel|guest_house|hostel|apartment` |
| Weather / snow | Open-Meteo forecast API (no key) |
| Data store (v1) | Versioned JSON under `data/`, validated by Pydantic models. **No database.** |
| API contract | FastAPI OpenAPI → `openapi-typescript` generates `apps/web/src/lib/api-types.ts` |
| Tooling | pnpm (web), uv (api), Biome (TS lint+format), Ruff (lint+format), Pyright (types), Docker Compose (local infra) |

## Commands

```bash
# one-time
pnpm install --dir apps/web
uv sync --project services/api
docker compose -f infra/docker-compose.yml up -d valhalla      # first run builds tiles (~10–20 min)

# dev
uv run --project services/api fastapi dev services/api/src/hakuba_api/main.py --port 8010   # :8010 (8000 is used by another local project)
pnpm --dir apps/web dev                                                          # :3000
pnpm --dir apps/web dev:https    # instead of `dev`: https://<Mac Wi-Fi IP>:3443 for pilot mode on a phone
                                 # (self-signed cert in apps/web/.certs, nothing installed; accept the
                                 # warning once on the phone; LAN only; stop `dev` first, Next allows one;
                                 # restart it after a network change)
E2E_BASE_URL=https://127.0.0.1:3443 pnpm --dir apps/web e2e   # run the suite against dev:https
pnpm --dir apps/web gen:api        # regenerate TS types from http://127.0.0.1:8010/openapi.json

# quality gates (all must pass before commit)
uv run --project services/api ruff check --fix && uv run --project services/api ruff format
uv run --project services/api pyright
uv run --project services/api pytest -q
pnpm --dir apps/web lint            # biome check --write
pnpm --dir apps/web typecheck       # tsc --noEmit
pnpm --dir apps/web test            # vitest run
pnpm --dir apps/web e2e             # playwright test (needs api + valhalla running)

# data
uv run --project services/api python -m hakuba_api.data.validate              # validate all data/*.json
uv run --project services/api python -m hakuba_api.bus.check_sources          # detect timetable changes
```

## Project Structure

```
apps/web/                     Next.js app (web-app module)
  src/app/                    routes (single map page + layout)
  src/components/             map, search box, mode tabs, panels
  src/lib/                    api client, generated api-types.ts, formatters
  tests/                      vitest unit/component tests
  e2e/                        playwright tests
services/api/                 FastAPI service
  src/hakuba_api/
    main.py                   app + router registration
    catalog/ places/ routing/ snow/ crowd/ bus/ ranking/ pois/   ← one package per module id
    common/                   shared helpers: cache, geo, models, params, rate limit, upstream errors
    data/                     loaders + validate entrypoint
  tests/                      pytest, mirrors package layout; tests/fixtures/ for recorded HTTP
data/
  resorts.json                resort-catalog
  bus_stops.json              resort-catalog
  lodging_osm.json            place-search: Overpass lodging snapshot (refreshed by script)
  bus/sources.json            bus-schedules: watched asset URLs + sha256
  bus/timetables/<season>/<line>-<period>.json
  bus/raw/<season>/           downloaded source images/PDFs (gitignored, re-fetchable)
infra/
  docker-compose.yml          valhalla only (the API and web run as local processes; see SPEC-deploy)
  valhalla/                   custom_files volume (tiles, gitignored)
SPEC.md, SPEC-<module>.md     specs
tasks/plan.md, tasks/todo.md  plan + task list (created in the Plan phase)
```

## Code Style

**Python:** typed, Pydantic models at every boundary, pure functions for logic, I/O at the edges.

```python
# services/api/src/hakuba_api/bus/query.py
from datetime import datetime
from pydantic import BaseModel

class BusOption(BaseModel):
    resort_id: str
    line_id: str
    board_stop_id: str
    walk_seconds: int
    departs_at: datetime
    arrives_at: datetime

def next_departures(
    stop_id: str, after: datetime, timetables: list[Timetable], limit: int = 3
) -> list[Departure]:
    """Pure: no I/O. Timetables are pre-filtered to the date's active period."""
    ...
```

**TypeScript:** function components, server state in TanStack Query only, API types from the generated file and never written by hand.

```tsx
// apps/web/src/components/ResortList.tsx
import type { components } from "@/lib/api-types";
type RankedResort = components["schemas"]["RankedResort"];

export function ResortList({ resorts, onSelect }: { resorts: RankedResort[]; onSelect: (id: string) => void }) {
  return (
    <ol className="divide-y">
      {resorts.map((r) => (
        <li key={r.resortId}>
          <button type="button" onClick={() => onSelect(r.resortId)}>{r.name}</button>
        </li>
      ))}
    </ol>
  );
}
```

**Conventions**
- IDs are kebab-case and stable: `happo-one`, `hakuba47`, `line-v`, `stop-jr-hakuba-station`.
- Coordinates are always `{lat, lng}` objects in the API and never bare tuples. (Valhalla/GeoJSON `[lng, lat]` order is converted only inside `routing`.)
- All times are timezone-aware `Asia/Tokyo` and serialized as ISO 8601 with offset. Durations are integer seconds.
- API JSON uses camelCase (Pydantic `alias_generator=to_camel`). Python stays snake_case.
- Every displayed estimate is labeled as such ("ETA ~", "Crowd: estimated").

## Testing Strategy

| Level | Tool | What |
|---|---|---|
| Unit | pytest | Pure logic: ranking scores, crowd heuristic, bus query, timetable validator, coordinate conversion |
| Contract | pytest + recorded fixtures (`respx`) | Adapters for Valhalla, Photon, Overpass, Open-Meteo against recorded responses. **No live network in the default test run.** |
| Data | pytest | Every file in `data/` passes Pydantic validation and cross-reference checks (stop ids exist, resort ids exist) |
| Integration | pytest, marker `@pytest.mark.live` | Real Valhalla container + real upstream APIs; run on demand: `pytest -m live` |
| Component | Vitest + Testing Library | Panels and list rendering, mode switching |
| E2E | Playwright | Search hotel → each mode shows a result on the map |

Coverage target: ≥ 90% lines on pure-logic packages (`ranking`, `crowd`, `bus/query`, `bus/validate`); no number is enforced for adapters or UI. Write tests first for pure logic (TDD).

## Boundaries

- **Always:**
  - Run the quality gates before every commit.
  - Validate `data/` after any data change.
  - Label estimates as estimates.
  - Cache upstream calls: Photon/Overpass for 24 h, Open-Meteo for 1 h. Send a descriptive `User-Agent` and respect the public instances' fair-use limits.
  - Credit sources in the UI: © OpenStreetMap contributors, OpenFreeMap, Open-Meteo, Hakuba Valley timetable source link.
- **Ask first:**
  - Adding a dependency that isn't in the stack table.
  - Adding a database.
  - Adding any paid API, or any API that needs a key.
  - Adding a region beyond Hakuba.
  - Changing a module boundary or the capability map.
  - Deploying anywhere public.
- **Never:**
  - Commit secrets or the Valhalla tiles / raw timetable downloads.
  - Call the Claude API, or any paid API, from code.
  - Scrape Google Maps or Google Popular Times, or any source whose terms forbid it.
  - Publish bus timetable JSON that hasn't passed the validator and human review.
  - Skip or delete failing tests to get green.

## Success Criteria (system level)

1. Searching "Hakuba" hotels returns real nearby lodgings, and selecting one sets the origin pin.
2. 🚗 Drive lists all 10 resorts with drive ETA and can be re-sorted by every criterion. Selecting a resort draws its route.
3. 🚶 Walk draws a walking route and ETA to any resort or stop.
4. 🚌 Bus shows the walk to the nearest stop plus the next 3 departures and arrival time at each reachable resort. When this season's timetable isn't published yet, times are projected from the last one and labeled **Expected**. Outside the season it says clearly that no service runs. No years are shown in the UI.
6. *(v1.1)* Routes look and behave like Google Maps directions: fitted map, ETA pills, alternates, turn-by-turn with icons, and a bus journey drawn walk → ride → resort.
7. *(v1.1)* Restaurants and convenience stores can be chosen as destinations in 🚗/🚶.
5. All quality gates pass. The Playwright E2E test covers all three modes.

## Open Questions

- ~~Hosting target for later~~ Answered by `SPEC-deploy.md`: Phase A this Mac + Tailscale Funnel, Phase B Vercel Hobby (ADR-0006; Oracle is the fallback).
- Real crowd data source (see `SPEC-crowd-level.md`).
- Whether the hakubavalley.com Weather & Snow / Lift Status pages can be parsed reliably (see `SPEC-snow-conditions.md`).
