# ADR-0001: Decisions on takeover follow-ups 1, 2, 3 and 5

## Status

Accepted (2026-11-05)

## Date

2026-11-05

## Context

[docs/ARCHITECTURE.md](../ARCHITECTURE.md) lists 10 follow-ups where the SPECs and the code disagree.
Follow-ups 4, 6 and 10 were settled by the code and closed in
[PR #9](https://github.com/r03922123/jp_ski_map/pull/9). The other four needed the owner's choice, so
PR #9's run ended with a decision brief: for each one, what the code does now, the options, and a
recommendation. The owner took the recommendation on all four. This ADR records them and the
brief's reasons, re-checked against `main` at `ddb6aca`.

Code paths are relative to `services/api/src/hakuba_api/` (api), `services/api/` (api tests) and
`apps/web/src/` (web), as in ARCHITECTURE.md.

## Decision

### 1. Bus-stop licensing: credit OSM and GSI now, replace the 56 Google My Maps pins later

- **Now:** [DATA-LICENSES.md](../../DATA-LICENSES.md) line 13 covers `data/bus_stops.json` as
  "Compiled by hand", with no attribution. The `coordSource` fields of its 100 stops say otherwise:
  - 56 pins from the operator's Google My Maps
  - 27 OpenStreetMap-derived: 12 `osm:`, 8 from the OSM lodging snapshot, 7 via Photon
  - 13 resort access points
  - 2 from the GSI address search (Japan's Geospatial Information Authority)
  - 2 not located yet
- **Why:** a credit line fixes the OSM and GSI stops in one file. It can't fix the My Maps pins: if
  Google's terms forbid copying them, crediting doesn't help. Replacing them is the only option that
  removes that risk without the 🚌 tab losing over half its stops.

### 2. Ranking data: fill `nightSkiing` now; hide the price sort only if 2026–27 prices aren't out

- **Now:** all 10 resorts in `data/resorts.json` have `dayTicketJpy` and `nightSkiing` set to
  `null`. The price sort puts unknowns last (`ranking/rank.py:106`), so it silently shows the
  drive-time order. The night-skiing filter keeps only `True` (`rank.py:85`), so turning it on
  empties the list. The web shows both controls (`components/SortControls.tsx:13`, `:78-84`).
- **Why:** night skiing is 10 yes/no facts that rarely change, and filling them fixes today's
  empty-list bug. Ticket prices change every season. If this season's aren't published yet, a
  hidden sort is more honest than one that quietly sorts by something else.

### 3. Crowd: the SPEC says holiday = Saturday; no code change

- **Now:** `holiday` and `saturday` both weigh 0.30 in `CrowdConfig` (`crowd/heuristic.py:19-20`),
  but SPEC-crowd-level said holiday > Saturday. Only a holiday that stands alone gets this weight;
  one next to a weekend becomes a "3-day weekend" (0.35, `heuristic.py:82-84`). From December 2026
  to April 2027 that leaves 3 days: Thu 11 Feb, Tue 23 Feb and Thu 29 Apr. No test checks the
  holiday-vs-Saturday order.
- **Why:** no data supports either order, so raising `holiday` would be a guess. A lone midweek
  holiday also doesn't allow an overnight trip, so it may not draw more skiers than a Saturday.
  Changing the words keeps behaviour as it is and is easy to reverse.

### 5. Crowd: keep `GET /api/crowd`; the SPEC says the web reads crowd through `/api/rank`

- **Now:** `crowd/router.py:31-39` serves `/api/crowd`, with 4 tests
  (`tests/crowd/test_heuristic.py:142-160`, `tests/test_hygiene.py:50-51`). No web code calls it.
  The web gets each resort's crowd inside `/api/rank`, whose router imports two helpers from the crowd
  router (`ranking/router.py:9-11`).
- **Why:** the endpoint is the SPEC's own interface, it's tested, and removing it deletes tests for
  little gain. It stays reachable through the web app's `/api/*` forwarding, but the per-client rate
  limit covers it (`main.py` `limit_clients`), and its snow data is cached for 1 h.

## Alternatives Considered

### 1. Credit everything, or remove the borrowed stops

- Credit only: a one-file change, but it doesn't help if Google's terms forbid copying the pins.
- Remove: the 🚌 tab would lose over half its stops.

### 2. Hide both controls until there's data

- A web change that also touches 3 unit-test files, and it hides night skiing, which is cheap to fill.

### 3. Raise the holiday weight above Saturday

- Needs a new test and a new number with nothing to base it on.

### 5. Remove `/api/crowd`

- Deletes 4 tests and changes the generated API types; the two helpers stay either way.

## Consequences

- Follow-ups 3 and 5 are done in words only, in
  [SPEC-crowd-level.md](../../SPEC-crowd-level.md). The code and the API are unchanged.
- Follow-ups 1 and 2 are decided but **not done**. Until follow-up 1 lands, the licensing risk stays
  in a public repo. The takeover stays in "tidy" until both are done.
- If real crowd data ever shows holidays are busier than Saturdays, revisit decision 3 with a new
  ADR that supersedes this one.

## Next steps

Each is its own PR.

1. **Follow-up 1, credit:** read the OSM (ODbL) and GSI terms, then add their credits for
   `data/bus_stops.json` to DATA-LICENSES.md.
2. **Follow-up 1, replace:** re-locate the 56 My Maps stops from OSM or GSI and update their
   `coordSource`.
3. **Follow-up 2:** fill `nightSkiing` for all 10 resorts, with a source for each. Check whether
   2026–27 day-ticket prices are published: fill `dayTicketJpy` if they are, hide the price sort if not.
