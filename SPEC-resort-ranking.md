# Spec: resort-ranking

> Module of [SPEC.md](SPEC.md). Depends on: resort-catalog, routing, snow-conditions, crowd-level. Consumed by: web-app (🚶 Walk tab).

*2026-11-25: Drive mode removed. The travel-time key is `walk_time` (a walk matrix; measured 0.042 s median, n=5, local, vs 0.05 s for the road matrix), and `maxDriveMin` is `maxWalkMin`.*

## Objective
From the user's origin, rank all resorts by **one criterion the user chooses**, and show every factor's value so the user can compare resorts themselves.

**Decision (2026-10-28):** v1 has no combined "best overall" score. Every factor is a separate sort option. A weighted or learned "best" score is a research item (see Open Questions).

## Criteria (sort keys)
| key | Meaning | Better = |
|---|---|---|
| `walk_time` (default) | Valhalla walking duration to the nearest access point | lower |
| `fresh_snow` | newSnow past24h + 0.5 × next24h | higher |
| `snow_depth` | summit depth | higher |
| `crowd` | crowd score for the date | lower |
| `terrain_size` | runs, then lifts as tiebreak | higher |
| `vertical` | vertical drop | higher |
| `price` | day ticket JPY | lower |

Filters: `nightSkiing`, `hakubaValleyPass`, `maxWalkMin`.

## Interface
- `GET /api/rank?from=lat,lng&sort=walk_time&date=YYYY-MM-DD&nightSkiing=&hakubaValleyPass=&maxWalkMin=` → `RankedResort[]`
```jsonc
{ "resortId": "hakuba47", "name": "…", "rank": 1,
  "sortValue": 840,                       // raw value of the chosen key (null if unknown)
  "walkS": 840, "walkDistanceM": 9200, "accessPointId": "hakuba47-base",
  "factors": { "walk_time": 840, "fresh_snow": 22, "snow_depth": 260,
               "crowd": 0.55, "terrain_size": 24, "vertical": 818, "price": 7500 },  // raw values
  "snow": { …SnowReport }, "crowd": { …CrowdEstimate } }
```

## Rules
- Sort by the raw value in the key's direction. Ties are broken by `walk_time`, then by `resortId`.
- `null` sorts last for its key and is shown as "—" in the UI.
- Walk time comes from one Valhalla walking matrix call (origin → all access points), taking the min per resort.
- Ranking is a pure function `rank(resorts, factors, sort, filters) -> list[RankedResort]`. Data fetching happens in the router.

## Acceptance Criteria
- [ ] Each of the 7 sort keys orders correctly on a fixture set (unit tests, no network).
- [ ] Null handling: a resort with a null price comes last under `price` and is unaffected under the other keys.
- [ ] Filters remove the right resorts (unit tests). `maxWalkMin` uses the walk time from the matrix.
- [ ] Unknown `sort` → 422.
- [ ] The response contains all resorts that pass the filters, in < 1 s locally.

## Performance (measured 2026-10-29, local)
- Valhalla matrix (1 origin → 12 access points): ~0.11 s. A warm `/api/rank`: ~0.05 s.
- A cold `/api/rank` takes ~1.3 s, because the hourly snow cache misses and Open-Meteo takes ~1.2 s. If that becomes noticeable, warm the snow cache on startup or in the background (not done in v1).

## Boundaries
- Ask first: adding any combined score (weighted, ML or personalized) before the research item below is done.

## Open Questions (research backlog)
- **"Best overall":** how to combine factors. Options: user weight sliders, sensible preset profiles ("powder chaser", "beginner family", "short drive"), or learning from user choices. Decide after v1 is in use.

## v1.1: Sources and weights, one tap away (2026-11-19, draft)

**Objective.** A skier who doubts a number in the ranked list can see where it came from and, for the crowd
score, how it was added up, without that detail cluttering the list. Today each row's "Details" shows the raw
factor values and the crowd reasons, but no source links and no weights (checked 2026-11-19 in
`apps/web/src/components/ResortList.tsx`).

**What changes.**
1. **API, crowd-level.** `CrowdEstimate` gains `contributions: [{ "label": str, "weight": float }]`, one entry
   per term the heuristic added, in the order it added them: day type, the counted peak period, powder, resort
   prior, season edge. `weight` is the exact amount added (season edge is negative). An overlapping peak period
   that wasn't counted (only the largest counts) is listed with weight 0, so `contributions` and `reasons`
   carry the same labels in the same order. `reasons` stays unchanged: the web app and the MCP tool
   (`services/mcp/src/hakuba_mcp/server.py`, `crowdReasons`) read it. `score` stays `clamp(0..1, round(sum))`.
2. **API, resort-ranking.** `RankedResort` gains `statsSource` and `website`, copied from the catalog
   (`Resort.stats_source`, `Resort.website`). `statsSource` is free text with URLs in it, as stored.
3. **Web.** Inside each row's existing "Details", a second `<details>` named "Sources & weights", closed by
   default (that is the "hidden" part: two taps to reach it, zero extra height in the list). It shows:

   | Factor | Source shown |
   |---|---|
   | Walk time | "OpenStreetMap roads, Valhalla router" → https://www.openstreetmap.org/copyright |
   | Fresh snow, snow depth | "Open-Meteo model" (or "reported" when `depthCm.source` says so) → https://open-meteo.com/ |
   | Crowd | each contribution as `label  +0.30`, then `sum`, then "capped to 0–1" if the sum was outside, then the level thresholds (< 0.30 low, < 0.55 medium, < 0.80 high) |
   | Runs, vertical, price | `statsSource` with each `http(s)://` URL turned into a link, then the resort `website` |

   Links open in a new tab with `rel="noopener noreferrer"`. Only `http:` and `https:` URLs become links;
   anything else stays plain text.

**Assumptions (decided, say if wrong).**
- "Hidden" = a closed disclosure inside Details, not a tooltip: tooltips don't work on touch, and this app is
  phone-first (SPEC-web-app v1.9).
- Peak-period `source` text in `data/crowd_periods.json` isn't a URL ("approx. NSW/VIC term dates"), so it isn't
  shown; adding real URLs there is a data task, not this change.
- English labels, like the rest of the list.
- No new dependency: the URL-to-link split is a small regex in the component.

**Done when.**
- [ ] pytest: for the two crowd fixtures in SPEC-crowd-level, `sum(c.weight for c in contributions)`, rounded
  and clamped, equals `score`, and every weight equals its `CrowdConfig` or `crowd_periods.json` value.
- [ ] pytest: Jigatake (prior 0) has no prior entry; two overlapping peak periods give one counted entry and one
  weight-0 entry; `contributions` labels == `reasons`.
- [ ] pytest: `/api/rank` rows carry `statsSource` and `website` equal to the catalog.
- [ ] `src/lib/api-types.ts` regenerated with `pnpm --dir apps/web gen:api`, not hand-edited.
- [ ] vitest (`tests/ResortList.test.tsx`): "Sources & weights" is closed by default; opened, it shows a link per
  URL in `statsSource` with the exact href, the Open-Meteo and OSM links, and each crowd weight with its sign;
  a `javascript:` string in `statsSource` renders as text, not a link.
- [ ] Screenshot of one opened row at phone width (375 px), list height unchanged while closed.
- [ ] All CI checks in CLAUDE.md pass for services/api, services/mcp and apps/web.

**Commands.** `uv run --directory services/api --frozen pytest -q`, then `ruff check`, `ruff format --check`,
`pyright`; `pnpm --dir apps/web gen:api` (API on :8010), `pnpm --dir apps/web test tests/ResortList.test.tsx`,
`pnpm --dir apps/web exec biome ci`, `pnpm --dir apps/web typecheck`.

**Files.** `services/api/src/hakuba_api/crowd/{models,heuristic}.py`, `ranking/rank.py` (+ where RankedResort is
built), their tests; `apps/web/src/lib/api-types.ts`; `apps/web/src/components/ResortList.tsx`, its test.
About 150 changed lines: one PR.

**Boundaries.**
- Always: keep `reasons` and every existing field; additive API change only.
- Ask first: changing any weight or the score formula; a combined ranking score (see Open Questions).
- Never: render a non-http(s) URL as a link; fetch the source pages from the client.
