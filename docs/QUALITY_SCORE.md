# Quality score

One page that says, per module, how far the docs and tests can be trusted, so an agent (or a new
owner) knows where to look first. Two kinds of grade, kept apart on purpose:

- **Mechanical grade** is computed by `python3 scripts/check_docs.py --signals` from git and the
  test files. It measures hygiene, not correctness: start at A, drop one letter for no tests, one
  for a spec more than 14 days behind its code, one per Open row in
  [tech-debt-tracker.md](tech-debt-tracker.md) (at most two). Most modules score A today, which
  says the repo is tidy, not that the specs are right.
- **Reviewed grade** comes from a `doc-gardening` run that read the spec against the code and the
  tests, with the evidence written down. It is the one to trust. A module with no review yet says
  so; nothing is graded from impressions.

"Spec behind code" is the order to review in, not a defect by itself: code often changes with no
spec change needed. "Criteria ticked" is unreliable until debt D4 is closed.

## Signals (generated; refresh with the command above, do not edit by hand)

<!-- signals:start -->
Signals at `a75a33b` (2026-11-21), from `python3 scripts/check_docs.py --signals`.

| Module | Spec changed | Code changed | Spec behind code | Tests | Criteria ticked | Open debt | Mechanical grade |
|---|---|---|---|---|---|---|---|
| `resort-catalog` | 2026-11-06 | 2026-11-06 | 0 d | 10 | 0/5 | 0 | A |
| `place-search` | 2026-11-16 | 2026-11-16 | 0 d | 126 | 8/20 | 1 | B |
| `routing` | 2026-11-09 | 2026-11-16 | 7 d | 47 | 0/9 | 1 | B |
| `snow-conditions` | 2026-11-16 | 2026-11-16 | 0 d | 30 | 2/6 | 0 | A |
| `crowd-level` | 2026-11-19 | 2026-11-19 | 0 d | 19 | 0/4 | 0 | A |
| `bus-schedules` | 2026-11-18 | 2026-11-18 | 0 d | 127 | 0/24 | 0 | A |
| `resort-ranking` | 2026-11-19 | 2026-11-19 | 0 d | 14 | 0/12 | 0 | A |
| `poi-destinations` | 2026-10-30 | 2026-10-30 | 0 d | 9 | 0/4 | 1 | B |
| `saved-places` | 2026-10-30 | 2026-11-20 | 21 d | 36 | 6/6 | 0 | B |
| `pilot` | 2026-11-09 | 2026-11-20 | 11 d | 61 | 17/18 | 0 | A |
| `game-theme` | 2026-11-20 | 2026-11-20 | 0 d | 30 | 0/7 | 0 | A |
| `progression` | 2026-11-10 | 2026-11-20 | 10 d | 14 | 0/7 | 0 | A |
| `web-app` | 2026-11-20 | 2026-11-20 | 0 d | 544 | 11/43 | 0 | A |
| `deploy` | 2026-11-13 | 2026-11-18 | 5 d | 22 | 0/0 | 0 | A |
| `agent-tools` | 2026-11-19 | 2026-11-18 | 0 d | 65 | 7/14 | 0 | A |
| `pipeline` | 2026-11-18 | 2026-11-18 | 0 d | 6 | 0/0 | 0 | A |
| `ask-maps` | 2026-11-18 | — | 0 d | 0 | 0/0 | 0 | — (proposed) |
<!-- signals:end -->

## Reviewed grades

Each `doc-gardening` run reviews the two modules with the largest "Spec behind code" that have no
review newer than their last code change, and adds or replaces one row here.

| Module | Reviewed grade | Reviewed at | What was checked | Gaps found (debt ids or PRs) |
|---|---|---|---|---|
| — | — | — | No module reviewed yet; the first run starts with `saved-places` (21 d) and `pilot` (11 d) | — |

Reviewed grade scale: **A** spec matches code and every behaviour the spec promises has a test;
**B** small drift (wording, a count, a path) or a promised behaviour without a test; **C** the spec
describes behaviour the code no longer has, or the reverse; **D** the spec can't be used to work on
the module.
