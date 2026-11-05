# Spec: snow-conditions

> Module of [SPEC.md](SPEC.md). Depends on: resort-catalog. Consumed by: crowd-level, resort-ranking, web-app.

## Objective
Give each resort a snow picture that can be compared across resorts: current depth, recent new snow, and the forecast for new snow. This feeds the "snow condition" ranking.

## Sources
1. **Open-Meteo forecast** (primary, always available): `https://api.open-meteo.com/v1/forecast` at each resort's summit and base, with `hourly=snow_depth`, `daily=snowfall_sum,temperature_2m_max,temperature_2m_min`, `past_days=3`, `forecast_days=3`, `timezone=Asia/Tokyo`, and `elevation=<m>` set explicitly so the result isn't taken from the grid cell's average height.
2. **Resort-reported** (optional, best effort; **not built yet**, planned for after the season opens, see the Recommendation under "Spike result" below): the hakubavalley.com *Weather & Snow* page. This is used only if a spike shows it can be parsed reliably. If present, reported depth takes precedence over modeled depth and is marked `source: "reported"`. Until it is built, every depth is `source: "model"`; the `"reported"` value stays in `snow/models.py` for that adapter.

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

## Spike result: hakubavalley.com Weather & Lift Status (2026-10-29, ~20 min) — GO, after season opens
Page: https://www.hakubavalley.com/en/weather_en/ (lift status at `#lift`, per-resort detail at `/en/weather_en/detail_<resort>_en/`).
- **Server-rendered HTML, no API needed.** `robots.txt` allows everything except `/cms/wp-admin/`.
- **Snow depth per resort:** `.report-item > a.report-link[href*="detail_<resort>_en"]`, with `h3.gelande_name`, `.snow_status .status-item` (depth number), `.weather_status .status-label` ("Cloudy"), and `.update .date` ("2026/10/29 16:08 update").
  ```html
  <div class="status-field snow_status"><span class="status-item">0</span><span class="status-label">SNOW DEPTH</span></div>
  ```
- **Lift status per lift:** a table per resort, `<tr class="status_closed"><td>Adam Gondola</td><td>CLOSED</td></tr>` (row class `status_open` / `status_closed`). That gives "lifts open n/m", which is also a useful signal for crowd-level.
- **Gaps:** Kashimayari, Hakuba47 and Iwatake show no depth or update time here (they link to their own sites), so those 3 keep the model depth.
- **Unknowns until the season opens (~mid-December):** whether the single depth figure is base or summit (detail pages may say), its unit (assumed cm), and how the open-lift classes look in practice. Everything reads 0 / CLOSED today.
- **Recommendation:** add a `ReportedSnowSource` adapter after the season opens (fetch at most every 30 min, fall back to the model on any parse failure), record a mid-season fixture first, then switch `depthCm.source` to `"reported"` where present. It is not built now, because off-season HTML can't validate the parser.

## Open Questions
- Base vs summit meaning of the reported depth (check in December).
