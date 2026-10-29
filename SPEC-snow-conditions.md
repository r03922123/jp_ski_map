# Spec: snow-conditions

> Module of [SPEC.md](SPEC.md). Depends on: resort-catalog. Consumed by: crowd-level, resort-ranking, web-app.

## Objective
Give each resort a snow picture that can be compared across resorts: current depth, recent new snow, and the forecast for new snow. This feeds the "snow condition" ranking.

## Sources
1. **Open-Meteo forecast** (primary, always available): `https://api.open-meteo.com/v1/forecast` at each resort's summit and base, with `hourly=snow_depth`, `daily=snowfall_sum,temperature_2m_max,temperature_2m_min`, `past_days=3`, `forecast_days=3`, `timezone=Asia/Tokyo`, and `elevation=<m>` set explicitly so the result isn't taken from the grid cell's average height.
2. **Resort-reported** (optional, best effort): the hakubavalley.com *Weather & Snow* page. This is used only if a spike shows it can be parsed reliably. If present, reported depth takes precedence over modeled depth and is marked `source: "reported"`.

## Interface
- `GET /api/snow` → `SnowReport[]` (all resorts)
```jsonc
{ "resortId": "happo-one", "asOf": "2026-01-10T07:00:00+09:00",
  "depthCm": { "base": 120, "summit": 280, "source": "model|reported" },
  "newSnowCm": { "past24h": 18, "past72h": 45, "next24h": 10, "next72h": 30 },
  "tempC": { "summitMin": -12, "summitMax": -6 } }
```

## Acceptance Criteria
- [ ] All 10 resorts get a report. The upstream is called at most once per resort per hour (cache).
- [ ] A missing value from upstream is `null`, never 0.
- [ ] Unit tests against a recorded Open-Meteo fixture: 24/72 h sums are computed correctly from hourly/daily data.
- [ ] `asOf` and `source` are always shown in the UI.

## Boundaries
- Never: scrape sources whose terms forbid it (e.g. snow-forecast.com, unless allowed). Ask first before adding any new source.

## Findings (2026-10-29, January 2026 historical-forecast fixture)
- New snow and temperature respond to the requested `elevation` (summits colder and snowier: Happo summit +72 cm / 72 h vs Jigatake +15 cm).
- `snow_depth` comes from the ~9–11 km model grid and barely uses elevation: neighbouring resorts share identical base depths (e.g. 41 cm for Goryu…Norikura), and Cortina reads 189/189. Depth is therefore labelled `source: "model"`, and resort-reported depth (spike below) is the real fix.
- Pydantic `to_camel` turns `past24h` into `past24H`; `NewSnow` disables the alias generator so the wire names stay `past24h` etc.

## Open Questions
- **Spike:** can hakubavalley.com Weather & Snow / Lift Status be parsed into per-resort depth and lifts-open? This is time-boxed to 1 h, and the result is recorded here.
