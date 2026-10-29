# Spec: resort-catalog

> Module of [SPEC.md](SPEC.md). Depends on: — . Consumed by: snow-conditions, crowd-level, bus-schedules, resort-ranking, web-app.

## Objective
The static reference data that every other module joins on: the resorts, the access points where you start skiing, and the shuttle bus stops. It changes rarely, is edited by hand, and is validated by Pydantic.

## Data (in `data/`)

`resorts.json`: list of (stats parsed from https://www.hakubavalley.com/en/ski_resort_info_en/; access points = lower lift terminals from OSM)
```jsonc
{
  "id": "happo-one",
  "name": { "en": "Hakuba Happo-One Snow Resort", "ja": "白馬八方尾根スキー場" },
  "region": "hakuba-valley",
  "website": "https://www.happo-one.jp/en/",
  "accessPoints": [                // where you park / start skiing; routing target
    { "id": "happo-one-adam-gondola", "name": { "en": "Adam Gondola", "ja": "八方ゴンドラ「アダム」" },
      "coord": { "lat": 36.70179, "lng": 137.83683 }, "coordSource": "osm:way/31895856 (lower lift terminal)" }
  ],
  "stats": { "baseElevationM": 760, "topElevationM": 1831, "verticalM": 1071,
             "gondolas": 1, "chairLifts": 22, "runs": 16, "longestRunM": 8000, "totalRunsM": 23300, "areaHa": 220,
             "terrainPct": { "beginner": 30, "intermediate": 50, "advanced": 20 },
             "nightSkiing": null, "dayTicketJpy": null },
  "hakubaValleyPass": true,
  "statsSource": "https://… (URL + date checked)"
}
```
No summit coordinate: snow-conditions queries Open-Meteo at the primary access point with `elevation` = base / top elevation (decided 2026-10-29).

`bus_stops.json`: list of
```jsonc
{ "id": "stop-jr-hakuba-station",
  "name": { "en": "JR Hakuba Station", "ja": "JR白馬駅" },
  "coord": { "lat": 0, "lng": 0 },
  "servesResortId": null,                 // or "happo-one" if the stop is at a resort
  "aliases": ["JR Hakuba Station"],       // exact strings as printed in timetables (EN)
  "coordSource": "osm:node/123 | manual" }
```

## Interface
- Python: `catalog.get_resorts() -> list[Resort]`, `catalog.get_resort(id)`, `catalog.get_stops()`, `catalog.stop_by_alias(name) -> BusStop | None`.
- HTTP: `GET /api/resorts` → `Resort[]`. `GET /api/bus-stops` → `BusStop[]`.

## Acceptance Criteria
- [ ] All 10 Hakuba Valley resorts are present. Each has at least one access point with real coordinates, checked against OSM or the resort map.
- [ ] Every stop name that appears in any Hakuba Valley shuttle timetable is an alias of exactly one `BusStop`.
- [ ] Goryu has two access points (Escal Plaza, Iimori) and Happo-One has its main base areas. Multi-base resorts are modeled as multiple access points, not as multiple resorts.
- [ ] `python -m hakuba_api.data.validate` fails on: duplicate ids, missing EN or JA name, coordinates outside the Hakuba bounding box (lat 36.55–36.90, lng 137.75–137.95), terrain % not summing to 100.
- [ ] Every stat has a `statsSource`. Unknown stats are `null`, not guessed.

## Boundaries
- Ask first: adding resorts outside Hakuba Valley.
- Never: invent stats or coordinates. Use `null` and list them under Open Questions.

## Open Questions
- Which stats can be found reliably for the small resorts (Jigatake, Sanosaka)? Missing values are left `null`. The ranking module must handle `null`.
