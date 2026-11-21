# Tech-debt tracker

Debt is a known gap between what the code does and what it should do that no task in
[tasks/todo.md](../tasks/todo.md) owns yet. A bug with a task stays in todo.md; when a task takes
a row, move the row to Closed with the task id. Every row needs evidence a reader can re-check
(a `file:line`, a command and its output, or a commit). The `doc-gardening` skill re-checks the
Open rows each run and moves the ones that no longer hold.

The Module column is a module id from [SPEC.md](../SPEC.md), or `all`. Open rows count against
that module's mechanical grade in [QUALITY_SCORE.md](QUALITY_SCORE.md) (`all` rows count against
none).

## Open

| Id | Module | Debt | Evidence | Found | Plan |
|---|---|---|---|---|---|
| D1 | `place-search` | Lodging and Overture snapshots are not pinned: Overpass has no `[date:]` and Overture takes the newest release, so a refresh can't be replayed | `grep -rn '\[date:' services/api/src` finds nothing; `latest_release` in `services/api/src/hakuba_api/places/refresh_overture.py:195` | 2026-11-18 review | SPEC-pipeline (pinning row) |
| D2 | `poi-destinations` | The POI snapshot's Overpass query is not pinned to a date | `services/api/src/hakuba_api/pois/refresh_pois.py`: no `[date:]` | 2026-11-18 review | SPEC-pipeline (pinning row) |
| D3 | `routing` | Valhalla tiles build from `chubu-latest`, so two builds of the same commit can route differently | `infra/valhalla/build-hakuba.sh:10` | 2026-11-18 review | SPEC-pipeline (pinning row) |
| D4 | `all` | SPEC acceptance checkboxes are not maintained (51 of 184 ticked), so they can't show progress | SPEC.md header note; `grep -ho -- '- \[[ x]\]' SPEC*.md \| sort \| uniq -c` | 2026-11-21 | `doc-gardening` ticks a box only with a passing test or a recorded check as evidence |
| D5 | `all` | `tasks/todo.md` is 979 lines with 84 finished tasks between ~20 open ones, and every session reads all of it | `wc -l tasks/todo.md`; `grep -c '✅' tasks/todo.md` | 2026-11-21 | Proposal: move finished tasks to `tasks/done.md`, keep todo.md for open work (needs owner OK: it changes where status lives) |

## Closed

| Id | Module | Debt | Closed by | Date |
|---|---|---|---|---|
| R1 | `bus-schedules` | `locate_stops --write` wrote a `coordSource` prefix the licence test rejects (review finding 1) | Fixed: `locate_stops.py:171` writes `not located yet: …`, a known prefix | verified 2026-11-21 |
| R3 | `agent-tools` | SPEC-agent-tools said 11 eval questions, the file had 12 (review finding 3) | Fixed: SPEC-agent-tools.md:26 and `trip_questions.json` both have 100 | verified 2026-11-21 |
| R4 | `deploy` | `deploy-vercel.sh` leaves out `stop_evidence.json` (review finding 4) | By design: `scripts/deploy-vercel.sh:62` uploads only what the API reads at runtime | verified 2026-11-21 |
| R5 | `deploy` | SPEC-deploy item 7 named `data/paths.py`, which does not exist | Fixed: now `services/api/src/hakuba_api/data/paths.py` (found by `check_docs.py`) | 2026-11-21 |
