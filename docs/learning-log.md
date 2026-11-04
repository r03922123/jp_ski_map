# Learning log

One entry per merged PR: the few "whys" worth remembering, in plain words. Newest on top.

## 2026-11-05 · PR #2: docs/ARCHITECTURE.md, a top-down tour

**1. Principle: describe the house that was built, not the blueprint.**
A SPEC is written before the code. Some SPECs weren't updated after the build, so the tour checks
every claim against the code, and it takes status from `tasks/todo.md`. It also follows the path users
really take. Crowd reaches the screen inside `/api/rank`, and the web app never calls `/api/crowd`.
*Analogy:* a builder's "as-built" drawing shows where the pipes really run. A plumber who trusts
the original blueprint drills into the wrong wall.

**2. Trade-off: list the mismatches, don't fix them here.**
The PR has one job: explain the project. The 10 mismatches are numbered follow-ups, each small
enough for its own PR. That makes this PR quick to review and safe to revert. The cost is that the
known problems stay in the code a while longer, and the list can go stale if nobody works through it.
*Analogy:* a home inspector writes the report and doesn't start repairs during the inspection. Each
repair is booked separately, so you can tell which fix caused a new leak.

**3. What could go wrong: data of unclear origin in a public repo.**
Some bus-stop coordinates came from Photon (OpenStreetMap, which needs attribution and share-alike),
the GSI address search, and the operator's Google My Maps pins (which Google's terms may not allow
copying). DATA-LICENSES.md says only "compiled by hand". The repo is public, so copies can spread
before anyone notices. Flagging the risk now, in writing, is cheaper than taking files down later.
The doc itself can also drift. It says which day it was checked against `main`, so a reader
knows how fresh it is.
*Analogy:* a restaurant that can't say where an ingredient came from should label it and check
with the supplier before the dish goes on the public menu.
