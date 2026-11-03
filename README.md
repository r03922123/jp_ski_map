# Hakuba Ski Map

A Google-Maps-style trip planner for skiers staying in **Hakuba Valley** (Nagano, Japan). Search for your hotel, then choose how to reach the slopes:

| Mode | What you get |
|---|---|
| 🚌 **Bus** | The nearest shuttle stops, the walk to them, the next departures, and arrival times at each resort, from transcribed 2025–26 timetables |
| 🚗 **Drive** | All 10 resorts ranked by one factor (drive time, fresh snow, snow depth, crowd level, terrain, vertical, price), with the route and ETA |
| 🚶 **Walk** | A walking route and ETA to a resort, a bus stop, food or a konbini |

It also has stops along the way, saved places (kept in your browser only), turn-by-turn "pilot" guidance for phones, and a light pixel-game layer (stamps and quests for the resorts you visit).

> Status: a personal project, built for the author and friends planning Hakuba trips. It covers only Hakuba Valley, but the data model doesn't hard-code the region.

## Stack

- **Web:** Next.js 16, React 19, MapLibre GL (via react-map-gl), Tailwind, TanStack Query, in `apps/web`
- **API:** FastAPI + Pydantic (Python 3.12, uv), in `services/api`; the web app talks only to `/api`, with types generated from its OpenAPI schema
- **Routing:** self-hosted [Valhalla](https://github.com/valhalla/valhalla) in Docker, on road tiles built only for Hakuba Valley (`infra/valhalla`)
- **Data:** JSON files in `data/`, reviewed as git diffs and validated on every load. There's no database
- **No paid APIs:** place search uses our own index first, with [Photon](https://photon.komoot.io) as a fallback; weather comes from [Open-Meteo](https://open-meteo.com)

## Run it locally

Needs Node 24+, pnpm, [uv](https://docs.astral.sh/uv/) and Docker.

```bash
# one-time
pnpm install --dir apps/web
uv sync --project services/api
docker compose -f infra/docker-compose.yml up -d valhalla   # first run builds the routing tiles (~10–20 min)

# dev: API on :8010, web on :3000
uv run --project services/api fastapi dev services/api/src/hakuba_api/main.py --port 8010
pnpm --dir apps/web dev
```

To try it on a phone on the same network, run `pnpm --dir apps/web dev:https` instead of `dev`. It serves `https://<your-computer's-IP>:3443` with a self-signed certificate.

## Tests and quality gates

```bash
uv run --project services/api ruff check && uv run --project services/api pyright && uv run --project services/api pytest -q
pnpm --dir apps/web lint && pnpm --dir apps/web typecheck && pnpm --dir apps/web test
pnpm --dir apps/web e2e   # Playwright; needs the API and Valhalla running
```

- **Unit:** pytest for the API (ranking, the bus query, validators, adapters on recorded fixtures); Vitest + Testing Library for the web app.
- **End to end:** about 330 Playwright tests, organised by user goal (set the start, reach a destination, plan a bus trip, stops and navigation, resilience to failing endpoints) on phone and laptop sizes, with real touch events. Known bugs are kept as `test.fail()` with an id, so a fix shows up as "expected to fail, but passed".
- **iPhone (WebKit):** `npx playwright test -c playwright.iphone.config.ts` runs key journeys on WebKit with iPhone emulation, the engine every iOS browser uses.
- **CI** (GitHub Actions) runs lint, type checks, unit tests, data validation and the production build on every push.

## How it's built

Every feature goes through written stages:

1. **Spec:** `SPEC.md` holds the capability map. Each module has its own `SPEC-<module>.md`, with objective, rules, boundaries and acceptance criteria.
2. **Plan and tasks:** these live in `tasks/plan.md` and `tasks/todo.md`.
3. **Test-first implementation.**
4. **Review.**

UX work starts from evidence. `docs/ux/` holds a four-evaluator heuristic review and a goal-by-device journey matrix. It also holds *behaviour cards* that record how Google Maps behaves for the same task, so we can say what we adopt and what we don't. Those cards are observed by a person, with [REA](https://github.com/morluto/rea) capturing only accessibility trees. REA browser scenarios also give step-by-step before/after comparisons of our own app for each fix.

## Project layout

```
apps/web/          Next.js app (src/components, src/lib, tests/, e2e/, e2e-iphone/)
services/api/      FastAPI service (src/hakuba_api, tests/)
data/              resorts, bus stops and timetables, lodging and POI snapshots (JSON)
infra/             docker-compose and the Valhalla tile build
docs/              UX review, behaviour cards, REA scenarios, data reviews
scripts/           serve and deploy helpers
SPEC*.md, tasks/   specs, plan and task list
```

## Licence and data

The code is under the [MIT licence](LICENSE). The bundled data comes from third parties under their own licences, and map data is © OpenStreetMap contributors. See [DATA-LICENSES.md](DATA-LICENSES.md) for sources and attribution.

Bus timetables are transcribed by hand from the operators' published 2025–26 timetables for trip planning. Always check the official timetable before you travel.
