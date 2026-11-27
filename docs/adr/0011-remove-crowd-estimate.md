# ADR-0011: Remove the crowd estimate

## Status

Accepted by the owner on 2026-11-24; carried out on 2026-11-26. Replaces
[SPEC-crowd-level.md](../../SPEC-crowd-level.md) and
the parts of [ADR-0001](0001-follow-ups-1-2-3-5.md) that set crowd weights.

## Date

2026-11-26

## Context

The app showed a crowd level (low, medium, high, very high) for each resort and date, and the API and the
agent tools could sort resorts by it. That level was a hand-weighted sum: day type (weekend, public holiday, 3-day
weekend), peak periods in `data/crowd_periods.json`, a powder bonus, a per-resort popularity prior
and a season-edge discount.

- **No grounded source.** Every weight was a judgment. None was fitted to, or checked against,
  observed crowds.
- **Never validated.** There were no labels, so the score was tested only against named cases that
  the same judgment wrote. Its errors could not be measured. One was visible: Jigatake's prior was 0
  and every date term applied to all resorts alike, so Jigatake ranked quietest on every date.
- **No data to fix it with.** Research on 2026-11-24 found no open per-resort daily crowd data for
  Hakuba. Google Popular Times is the one widely known source, and the SPEC forbids scraping it.

A number with no source and no ground truth, shown to skiers as a forecast, can send them to the
wrong resort on the busiest days. The "(est.)" label did not change that.

## Decision

1. The crowd estimate is removed everywhere a skier or an agent can reach it: `GET /api/crowd`,
   the `crowd` sort and the `crowd` field of `GET /api/rank`, the web app's crowd badge and
   weights, and the MCP `crowd_and_snow` tool, which becomes `snow_conditions`.
2. The `date` parameter of `/api/rank` and of the MCP `rank_resorts` tool goes too, because it only
   chose the crowd estimate's day. Snow is always the latest report. (The web's date picker went
   on 2026-11-25.)
3. The crowd package, its tests, `data/crowd_periods.json` and the `holidays` dependency are deleted.
   Git history keeps them.
4. An old shared link with `sort=crowd` opens with the default sort, and the agent says it has no
   crowd data when asked.

## Alternatives considered

- **Keep it, labelled more strongly.** A stronger label still shows an unmeasured number as a forecast.
- **Keep only the calendar part (weekends, holidays).** Skiers already know the calendar, and the
  ranking would still rest on unvalidated weights.
- **Scrape Google Popular Times.** Its terms forbid it, and the SPEC rules it out.

## Consequences

- `/api/rank` and `rank_resorts` sort by walk time, snow, resort size, vertical and price only.
  The web's Walk list still offers walk time and the three sizes. Its "Sources & weights"
  disclosure is now "Sources", since only crowd had weights.
- The agent eval drops the 12 questions whose answer is a crowd level (53 to 41). One mixed question
  was edited to no longer ask about crowds, and one (`nodata-happo-crowd`) now checks that the
  agent says it has no crowd data.
- `services/mcp/evals/last_run.md` and older review notes still mention crowd. They are records of
  what ran then, as are ADR-0001's crowd decisions, which this ADR replaces.

## What would bring it back

A crowd feature returns only with both of these:

1. **A grounded source** whose terms allow use: for example per-day lift or gondola ridership,
   parking counts, shuttle-full notices or ticket sales per resort.
2. **Ground truth to check it against:** about 20 to 50 labelled days across the season (holidays,
   weekdays, powder days), with an observed crowd level per resort. The estimate must then rank
   resorts in the same order as the labels, measured by a rank correlation (Spearman's rho or
   Kendall's tau) with its n and standard error, before it is shown to anyone.
