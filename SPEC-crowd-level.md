# Spec: crowd-level

> Module of [SPEC.md](SPEC.md). Depends on: resort-catalog, snow-conditions. Consumed by: resort-ranking, web-app.

## Objective
Estimate how crowded each resort will be on a given date. v1 is an **explainable heuristic**. The source is pluggable, so historical or real-time data can replace or calibrate it later without changing the API.

## Interface
- `GET /api/crowd?date=YYYY-MM-DD` → `CrowdEstimate[]`
```jsonc
// Happo-One on Sat 2026-02-14, with a snow report from that day showing 25 cm new
{ "resortId": "happo-one", "date": "2026-02-14", "level": "very_high", // low|medium|high|very_high
  "score": 0.95, "source": "heuristic", "isEstimate": true,
  "reasons": ["Saturday", "Lunar New Year week", "Powder day (25 cm new)", "Large, popular resort"] }
```
- The web app doesn't call `/api/crowd`. It reads each resort's crowd from `GET /api/rank` (the `crowd` field of each ranked resort), which builds it with the same `HeuristicCrowdSource` (`ranking/router.py` `get_crowd_for`). `/api/crowd` stays as this module's own, tested interface ([ADR-0001](docs/adr/0001-follow-ups-1-2-3-5.md)).
- Python protocol: `class CrowdSource(Protocol): def estimate(self, resort, date, snow) -> CrowdEstimate`. v1 implements `HeuristicCrowdSource`.

## Heuristic v1 (pure function; weights in `CrowdConfig`, peak-period weights in `data/crowd_periods.json`)
score = clamp(0..1) of the weighted sum of:
- **Day type**, highest first: 3-day weekend (see Peak periods) > Japanese public holiday, substitute or bridge day (`holidays` package, JP) = Saturday > Sunday > weekday. Holiday and Saturday share one weight because no data supports either order ([ADR-0001](docs/adr/0001-follow-ups-1-2-3-5.md)).
- **Peak periods** (a configurable date-range table in `data/crowd_periods.json`): New Year (Dec 28–Jan 4), Australian summer school holidays (≈ mid-Dec → late Jan), Lunar New Year week. February 3-day weekends are not in this table: they come from the day-type rule in `crowd/heuristic.py` (`_off_run`, `_day_type`), which treats any run of 3 or more weekend and `holidays`-calendar days, in any month, as a "3-day weekend".
- **Powder effect:** new snow ≥ 20 cm raises the score (from snow-conditions). For the snow report's own day that's the past 24 h; for the day after, the forecast next 24 h; any other date gets no powder factor (`_new_snow_for`).
- **Resort draw:** a hand-set prior per resort for size, popularity and closeness to the Happo/Echoland lodging (`CrowdConfig.resort_prior`: Happo-One 0.25 … Jigatake 0). Its reason is "Large, popular resort" at ≥ 0.20, "Moderately popular resort" at 0.10 or more but below 0.20, and "Less-visited resort" above 0 and below 0.10. A prior of 0 (Jigatake) adds nothing, so it gets no reason.
- **Season edges:** Dec 1–19, Mar 16–31 and all of April lower the score (`_is_season_edge`).

Levels: < 0.3 low, < 0.55 medium, < 0.8 high, otherwise very_high.

## Acceptance Criteria
- [ ] Deterministic: the same inputs always give the same score. Every contributing factor appears in `reasons`.
- [ ] Unit tests: a weekday in mid-Jan with no new snow at Jigatake → low; Saturday during Lunar New Year with a 30 cm powder day at Happo-One → very_high.
- [ ] The UI always shows "estimated" and the reasons.

## Boundaries
- Never: scrape Google Popular Times or any source whose terms forbid it.
- Ask first: adding any real-time or historical data source (each one becomes a new `CrowdSource`).

## Open Questions (research backlog)
- Real or open data candidates: lift-status pages (lifts open ≠ crowding), parking lot status pages, the Hakuba Valley shuttle "full capacity" notices, Nagano prefecture tourism visitor statistics (monthly visitors per resort, for calibrating the resort prior), and a JR/Alpico bus ridership feed if one exists.
