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
             "nightSkiing": null, "dayTicketJpy": 9800 },
  "hakubaValleyPass": true,
  "statsSource": "https://… (URL + date checked)"
}
```
No summit coordinate: snow-conditions queries Open-Meteo at the primary access point with `elevation` = base / top elevation (decided 2026-10-29).

`dayTicketJpy` is the adult 1-day lift ticket for the current season's main period, bought at the ticket window, in yen, without any refundable IC-card deposit; if a resort publishes only an online price for that ticket, it is that price, marked "online" in `statsSource` ([ADR-0003](docs/adr/0003-day-ticket-price.md), decided 2026-11-06).

Five cases ADR-0003 left open, settled 2026-11-06. Each keeps the 10 values comparable and makes any choice visible in `statsSource`. Applying them changed no value.

1. **Regular over peak.** If a resort sells a regular rate and a separate, higher peak rate (holidays, year-end) for the adult 1-day ticket, use the regular rate, because it covers the most days of the season. The page's labels decide: a rate it calls a discount stays a discount (Jigatake's 平日割引), and a period it calls high season is its main period, not a peak rate (Happo-One's ハイシーズン, the longest of its three periods). None of the 9 priced pages lists a peak rate (checked 2026-11-06).
2. **Joint tickets.** A ticket that also covers a neighbouring resort counts if it is the only standard adult 1-day ticket the resort's own page sells for the main period, leaving aside the Hakuba Valley pass for all 10 resorts. Its `statsSource` entry says "joint with <resort>": Goryu and Hakuba47 (with each other), Norikura (with Cortina). The partner resort still needs its own page to get a value, so Cortina stays `null`.
3. **Name the period.** "Plain" in ADR-0003's `statsSource` format means the page's price matches the definition with no choice beyond what the definition rules out (discounts, online prices): Jigatake, Kashimayari, Sanosaka. If the value is one period's price, chosen over early-season or spring rates, the note names that period with the page's dates: Happo-One (high season 12/19–3/22), Tsugaike (12/12–3/22), Goryu (12/16–3/14), Hakuba47 (12/15–3/10), Norikura (12/19–3/14).
4. **通常 prices.** 通常 (regular) names the standard price, not a sales channel, so a 通常 price that says neither window nor online counts as the window price. If it comes from a post other than the rates page, it counts only until the rates page shows the current season; then the rates page's price replaces it at the next check. Today that is Iwatake: the 通常 ¥7,500 in its 2026–27 early-bird news, while its rates page still shows 2025–26.
5. **Online fallback.** The definition line above now carries ADR-0003's online-only rule too, so a reader of this SPEC alone doesn't miss it. None of the 9 priced resorts needs it in 2026–27.

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
- [ ] Every stat has a `statsSource`. Unknown stats are `null`, not guessed. For `nightSkiing` and `dayTicketJpy`, a value needs the resort's or its operator's own page that states it; for `dayTicketJpy`, that page and its basis go in `statsSource` as ADR-0003 and the five cases under Data say.

## Boundaries
- Ask first: adding resorts outside Hakuba Valley.
- Never: invent stats or coordinates. Use `null` and list them under Open Questions.

## Open Questions
- Which stats can be found reliably for the small resorts (Jigatake, Sanosaka)? Missing values are left `null`. The ranking module must handle `null`.
- Do Hakuba47, Happo-One, Iwatake, Norikura and Cortina run night skiing in 2026–27? Their own pages still don't say (re-checked 2026-11-06), so `nightSkiing` stays `null` and the night-skiing filter leaves them out. Re-check in December ([follow-up 2](docs/ARCHITECTURE.md#follow-ups)).
- What is Cortina's 2026–27 day-ticket price? What `dayTicketJpy` means is settled in [ADR-0003](docs/adr/0003-day-ticket-price.md), and the other 9 resorts have a value. Cortina's own site shows a maintenance page (checked 2026-11-06), so its `dayTicketJpy` stays `null`, and the web keeps the price sort hidden until it has one. Re-check in December.
