# Spec: resort-ranking

> Module of [SPEC.md](SPEC.md). Depends on: resort-catalog, routing, snow-conditions, crowd-level. Consumed by: web-app (🚗 Drive tab).

## Objective
From the user's origin, rank all resorts by **one criterion the user chooses**, and show every factor's value so the user can compare resorts themselves.

**Decision (2026-10-28):** v1 has no combined "best overall" score. Every factor is a separate sort option. A weighted or learned "best" score is a research item (see Open Questions).

## Criteria (sort keys)
| key | Meaning | Better = |
|---|---|---|
| `drive_time` (default) | Valhalla drive duration to the nearest access point | lower |
| `fresh_snow` | newSnow past24h + 0.5 × next24h | higher |
| `snow_depth` | summit depth | higher |
| `crowd` | crowd score for the date | lower |
| `terrain_size` | runs, then lifts as tiebreak | higher |
| `vertical` | vertical drop | higher |
| `price` | day ticket JPY | lower |

Filters: `nightSkiing`, `hakubaValleyPass`, `maxDriveMin`.

## Interface
- `GET /api/rank?from=lat,lng&sort=drive_time&date=YYYY-MM-DD&nightSkiing=&hakubaValleyPass=&maxDriveMin=` → `RankedResort[]`
```jsonc
{ "resortId": "hakuba47", "name": "…", "rank": 1,
  "sortValue": 840,                       // raw value of the chosen key (null if unknown)
  "driveS": 840, "driveDistanceM": 9200, "accessPointId": "hakuba47-base",
  "factors": { "drive_time": 840, "fresh_snow": 22, "snow_depth": 260,
               "crowd": 0.55, "terrain_size": 24, "vertical": 818, "price": 7500 },  // raw values
  "snow": { …SnowReport }, "crowd": { …CrowdEstimate } }
```

## Rules
- Sort by the raw value in the key's direction. Ties are broken by `drive_time`, then by `resortId`.
- `null` sorts last for its key and is shown as "—" in the UI.
- Drive time comes from one Valhalla matrix call (origin → all access points), taking the min per resort.
- Ranking is a pure function `rank(resorts, factors, sort, filters) -> list[RankedResort]`. Data fetching happens in the router.

## Acceptance Criteria
- [ ] Each of the 7 sort keys orders correctly on a fixture set (unit tests, no network).
- [ ] Null handling: a resort with a null price comes last under `price` and is unaffected under the other keys.
- [ ] Filters remove the right resorts (unit tests). `maxDriveMin` uses the drive time from the matrix.
- [ ] Unknown `sort` → 422.
- [ ] The response contains all resorts that pass the filters, in < 1 s locally.

## Performance (measured 2026-10-29, local)
- Valhalla matrix (1 origin → 12 access points): ~0.11 s. A warm `/api/rank`: ~0.05 s.
- A cold `/api/rank` takes ~1.3 s, because the hourly snow cache misses and Open-Meteo takes ~1.2 s. If that becomes noticeable, warm the snow cache on startup or in the background (not done in v1).

## Boundaries
- Ask first: adding any combined score (weighted, ML or personalized) before the research item below is done.

## Open Questions (research backlog)
- **"Best overall":** how to combine factors. Options: user weight sliders, sensible preset profiles ("powder chaser", "beginner family", "short drive"), or learning from user choices. Decide after v1 is in use.
