# Spec: pipeline (rebuild everything from one URL)

> Module of [SPEC.md](SPEC.md). Depends on: every data-producing module (resort-catalog, place-search,
> bus-schedules, routing). Consumed by: CI, deploy. Drafted 2026-11-18, revised
> after a fresh-context review the same day.

## Objective

Starting from `https://www.hakubavalley.com/en/access_en/shuttlebus_en/` and a short, fixed list
of open data sources (the seed file below), one command rebuilds every artifact the running app
needs, with **no human step**, and gets at least what `main` serves on 2026-11-18 (72c3b35). Every
stage can be re-run alone and gives the same output from the same snapshot, so anyone can
reproduce any stage, and a new season or a new region is a re-run, not a project.

**Done when** (each item has a named check)
1. On a clean clone with snapshot-store access, `uv run --directory pipeline python -m
   hakuba_pipeline run --all` exits 0 and writes `data/`, the Valhalla tiles and the search index.
2. Given the snapshot set with hash X (recorded in `pipeline.lock.json`), `run --all --offline`
   twice gives byte-identical `data/`. CI job `pipeline-offline` checks it on every PR.
3. The rebuilt `data/` passes `python -m hakuba_api.data.validate` and the existing API, MCP and web
   suites with no test edited to pass.
4. Parity with `main` (`pipeline/out/parity.json`, asserted by `tests/test_parity.py`):
   10/10 resorts with every non-null stat of `main` non-null and equal; 100 stop rows with ≥ 98
   located, each within 50 m of `main`'s point (the same 2 may stay unlocated); 42/42 timetable
   routes accepted; ≥ 99.5% of `main`'s timetable cells equal (the rest listed by cell); lodging
   and POI counts within 2% of `main` at the same pinned date.
5. Nothing served was set by a person: `tests/test_provenance.py` fails if any served timetable
   lacks `verification.method == "auto:2-extractor"` or any data file lacks a lock entry.

**Out of scope:** rewriting the app (only the serving gate changes, P7); regions beyond Hakuba
(the seed format allows them, nothing more); a database; Kubernetes; **deploying** (ADR-0006 keeps
deploys on a machine with the tiles; the data PR is the end of this pipeline).

**Assumption (stated, not asked):** "no human intervention" means human *review* is replaced by
automatic verification gates, not removed. "Never serve `reviewed: false`" becomes "never serve
data that failed verification" (ADR-0007).

## Seeds: everything the pipeline may read

`pipeline/seeds/hakuba.toml` lists every source and why it is allowed. Nothing else is fetched.

| Source | Why |
|---|---|
| The shuttle page and the assets it links (timetable JPGs, season PDFs, My Maps KML) | the owner's starting point |
| `hakubavalley.com/en/ski_resort_info_en/` | same site; resort stats (today's `statsSource`) |
| Each resort's own site, from the `website` on that info page | prices and night skiing (ADR-0003) |
| Overpass at a pinned `[date:]`; Overture at a pinned release; Geofabrik at a dated extract | open data already used (ADR-0002, ADR-0004) |
| ~~Japanese public holidays: the `holidays` package, pinned~~ | ~~calendar for crowd periods~~ (crowd removed 2026-11-26, ADR-0011) |

~~The school-break ranges in `crowd_periods.json` become rules in code (the same "approx." dates,
now visible and tested), not a fetched source.~~ The file went with the crowd estimate (ADR-0011).

## What is hand-made today

From the code on 2026-11-18 ([review](docs/review/2026-11-18-codebase-review.md) has file:line).

| Artifact | Today | Hand step to remove |
|---|---|---|
| `data/bus/timetables/**` (42 files) | transcribed in a Claude Code session, `reviewed: true` set by a person | transcription, period splits, fares, dates, boarding rules, review |
| `bus_stops.json` (100 rows), `stop_evidence.json` (66) | rows written by hand; 51 evidence entries researched by hand (20 OSM, 1 access point, 30 Overture); the `MANUAL_MATCHES` table | rows, candidate matching, alias table |
| `data/resorts.json` | hand-written: stats, prices (ADR-0003), access points | all of it |
| ~~`data/crowd_periods.json`~~ | ~~hand-written, ranges marked "approx."~~ | ~~the calendar~~ (deleted 2026-11-26, ADR-0011) |
| `data/bus/sources.json` | `check_sources`, but `--accept` waits for the transcription | the gate |
| Lodging, POI, Overture snapshots | `refresh_*`, not pinned (no Overpass `[date:]`, newest Overture release, `fetchedAt=now()`) | pinning |
| Valhalla tiles | `build-hakuba.sh`, downloads `chubu-latest` | pinning |

The season PDF has **no text layer** (PyMuPDF: 179 characters, 0 `HH:MM` tokens; the times are
vector outlines), so timetables need a vision model. That is the hard stage.

## Design

**Shape: a DAG of small stages, a snapshot store, a lock file.** About 12 nodes, so a ~100-line
runner on the standard library, not Airflow or Dagster (Anthropic: start with the simplest thing
that works; upgrade if stages ever need scheduling across machines).

```
seeds/hakuba.toml
  └─ crawl ─────────► raw/ (page HTML, JPGs, PDFs, KML)            content-addressed
       ├─ lines ────► line ↔ resort map, resort names, stop names as printed
       ├─ osm ──────► lodging, POI, Overture snapshots; cropped PBF → Valhalla tiles
       ├─ resorts ──► resorts.json  (info page + OSM lifts + resort price pages)   needs osm
       ├─ stops ────► bus_stops.json (rows from printed names; My Maps pins + OSM/Overture/lodging/
       │              access-point candidates; Valhalla leg check)            needs lines, osm, resorts
       └─ timetables► timetables/**  (render → 2 extractors → canonical compare → validate)
                                                                          needs lines, stops
  verify (every stage) → parity.json → data PR
```

**Stage contract** (`pipeline/src/hakuba_pipeline/stages/<name>.py`): a function
`run(inputs: dict[str, Path], out: Path) -> None`, its declared inputs and outputs, and a
`version`. The runner hashes inputs + version; a hash already in `pipeline.lock.json` with its
outputs present is skipped. All network reads go through one `fetch(url)` that stores the bytes
under `snapshots/<sha256>` and logs URL and hash in the lock; `--offline` reads only the store.
Model outputs are stored the same way, keyed by (model id, prompt hash, image hash), so replay
never calls a model.

**The snapshot store must be durable.** The GitHub Actions cache evicts after 7 days unused,
Overture drops old releases and Geofabrik doesn't keep dated extracts forever, so a cache can't
be the source of truth. Store: a **private** GitHub repo `jp_ski_map-snapshots` with Git LFS
(free tier 1 GB storage / 1 GB bandwidth a month; the set is about 60 MB: posters ~20 MB, KML,
the cropped Hakuba PBF instead of the 300+ MB Chubu extract, model outputs). Private because the
posters are third-party (the main repo is public). CI reads it with a deploy key.

**The timetable stage.**
1. Render every JPG and the three season PDFs at 300 dpi; crop one route per image. P3 extends
   `ml/timetable_vlm/dataset.py` to render the PDFs (5 routes today unrendered) and to detect the
   headers of lines H and I (6 routes today skipped). Check: 42/42 routes cropped.
2. Two independent extractors return the whole route as JSON (field table below):
   **A** a hosted Claude vision model with structured outputs (owner OK needed, ADR-0007). Estimate
   from the pricing page (2026-11-18), about 45 crops × (2k tokens in, 3k out): Sonnet 5.5 ≈
   $1.50 a season run, Haiku 5.5 ≈ $0.08, Opus 5.5 ≈ $3. P3 measures all three once (≈ $5 cap) and
   picks the cheapest that clears the gate.
   **B** local Qwen2.5-VL-3B 4-bit + LoRA (`ml/timetable_vlm`). MLX needs Apple silicon, so B runs
   on GitHub's `macos-14` arm64 runner (free for public repos; 7 GB RAM, so the 2.9 GB model fits,
   measured in P3 before relying on it). The adapter is trained on **synthetic renders only** so
   it can be a public, hash-pinned release asset; real crops stay out of training (they are both
   third-party and the test set).
3. **Canonical form before comparing:** stop names resolved to stop ids (unresolved = mismatch);
   directions keyed by their stop-id sequence, not their label; trips sorted by first non-null
   time and renumbered; each cell one of `HH:MM`, `null` (no time printed) or `skip` ("—", the bus
   doesn't stop), never merged; a column whose times decrease down the stops is rejected before
   comparing (the reversed-arrow error seen on R1).
4. **Accept** a route when A and B agree on every canonical field the agreement covers and the
   validator passes; write `verification: {method: "auto:2-extractor", models: [...], lock: ...}`.
5. **On disagreement**, re-run A on the disputed cells with the crop zoomed; a cell is accepted only
   if the re-read equals **B's** value (A agreeing with itself proves nothing). A route still in
   dispute is **not served**; on a clean start it counts as missing in the parity report, and the
   web shows that line as "timetable not available" with the source link, as for an
   out-of-season line today.
6. **Gate before trust.** Gold = the 42 reviewed files, frozen once in a private copy in the
   snapshot store. Score only routes on lines B never saw (B trains on synthetic renders, so all
   42; A is zero-shot). Report accepted-cell accuracy with n and standard error, plus coverage
   (accepted routes / 42). **The agreement rule's accepted cells must be ≥ 99.5% correct**; until
   it is, P4 isn't done and `main`'s files keep being served as today (that is the current state,
   not a passing state).

**Timetable fields: who produces each.**

| Field | Producer | Covered by agreement |
|---|---|---|
| `directions` (stops, trips, times, skips) | A and B | yes |
| `validFrom`, `validTo`, period splits (●/★ columns → `-p1..p3`) | A and B read the legend | yes |
| `fare` | `lines` stage parses the page HTML (one fare for all lines today) | parser + fixture test |
| `lineId`, `routeId`, `name`, `kind` (night for VN) | `lines` stage, from the page structure and file names | parser + fixture test |
| `serviceDays`, `notes`, `boardOnly`, `alightOnly`, `restricted` | A and B | yes; a disagreement leaves the field at its safe default (no restriction claimed → route not served) |
| `source` | `crawl` | hash check |

**Resorts and prices.** Stats: the resort info page parsed with selectors and fixture tests.
`dayTicketJpy` and `nightSkiing`: extractor A reads each resort's price page with a required
`evidence_quote` that must appear verbatim in the fetched page, else `null` (as today for
Cortina). ADR-0003's five rules become a pure function, one test per rule. Access points: OSM
lower lift terminals by the existing rule.

**Running it.** CI job `pipeline-offline` on every PR. `timetable-watch.yml` (daily Oct–Jan,
weekly otherwise) changes from "open an issue with a checklist" to `run --all`; when a source hash
changed it opens a data PR with the parity report. The PR is opened with a fine-grained token
(secret `PIPELINE_PR_TOKEN`) because a PR opened by `GITHUB_TOKEN` doesn't start CI; it merges on
green CI under the owner's standing OK. Deploying the merged data stays outside the pipeline
(ADR-0006).

## Tasks (each one PR, built in a fresh session from this file)

| # | Task | Check |
|---|---|---|
| P1 | Runner, stage contract, lock, `fetch`, snapshot store repo; `crawl` from `check_sources` | unit tests; two offline runs → same lock |
| P2 | `lines`, `osm` (pinned), Valhalla from the cropped PBF, `stops` without `MANUAL_MATCHES`; fix the `unresolved:` licence-test gap | parity: snapshots equal at the same pin; 98/100 stops within 50 m |
| P3 | 42/42 crops (PDF render, H/I headers); gold set; extractor eval harness; A model choice; B on `macos-14` | report with n, SE, coverage per extractor |
| P4 | Canonical compare, agreement, re-read rule, field table | gate ≥ 99.5% and 42/42 accepted |
| P5 | `resorts` with evidence quotes; ADR-0003 as code | one test per rule; 10/10 parity |
| P6 | `calendar`; `pipeline-offline` CI; `timetable-watch.yml` opens data PRs | CI green; a dry run opens a PR that starts CI |
| P7 | API: `Timetable.verification` replaces `reviewed` (`bus/models.py:71`, `season.py:75,99`, the `awaiting_review` text in `services/mcp/.../server.py:169`, tests); ADR-0007 accepted; SPEC-bus-schedules and SPEC-resort-catalog updated | API + MCP gates; `test_provenance.py` |

## Boundaries
- Always: snapshot every fetched byte; send the project User-Agent; respect each source's terms
  (DATA-LICENSES.md); keep posters, crops and model weights trained on them out of the public repo.
- Ask first: spend beyond ADR-0007's cap; any source not in the seed file.
- Never: serve a timetable cell that failed verification; scrape Google Maps; add a `coordSource`
  prefix without an ADR (`test_data_licenses.py`); use GSI or AllThePlaces points for stops
  (ADR-0004). The My Maps pins keep their licence exception until the operator answers.
