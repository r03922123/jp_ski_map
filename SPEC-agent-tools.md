# Spec: agent-tools

> Module of [SPEC.md](SPEC.md). Depends on: the HTTP API (place-search, resort-ranking, bus-schedules, routing, poi-destinations, crowd-level, snow-conditions). Consumed by: any MCP client (Claude Code, Claude Desktop). Code: [services/mcp/](services/mcp/README.md).

## Objective
Let an LLM agent plan a Hakuba ski day by calling the existing API as tools. An MCP server (`hakuba-mcp`, the official `mcp` Python SDK, `MCPServer`, formerly FastMCP) wraps read-only GETs, trims each response to what a planner needs, and ships an eval that measures whether the agent picks the right tools.

## Tools
All places pass between tools as `"lat,lng"` strings. Times are minutes, snow is cm, crowd is a level. Every tool is `readOnlyHint`.

| Tool | Wraps | Inputs | Output (trimmed) |
|---|---|---|---|
| `search_place` | `GET /api/places/suggest` (local index + optional semantic retrieval) | `query`, `limit=5` | `name, nameJa, kind, coord, detail` |
| `rank_resorts` | `GET /api/rank` | `origin`, `sort` (walk_time, fresh_snow, snow_depth, crowd, terrain_size, vertical, price), `date?`, `night_skiing?`, `hakuba_valley_pass?`, `max_walk_min?`, `top=5` | `rank, resortId, name, sortValue, walkMin, summitDepthCm, newSnow24hCm, snowAsOf, crowdLevel, runs, areaHa` (runs and areaHa since 2026-11-25, when terrain_size became total run length) |
| `next_buses` | `GET /api/bus/options` | `origin`, `at?` (ISO, JST), `origin_name?`, `per_resort=2` | `status, nextServiceDate, basis, newerTimetablePending`, per resort `boardStop, walkMin, departs, departsFrom, arrives, rideMin, route, timed` (untimed: `departsFrom` may be an earlier stop; `arrives`, `rideMin` null) |
| `route` | `GET /api/route` (+ `/api/resorts` to resolve an id) | `origin`, `destination` (`lat,lng` or a resort id); walking only (2026-11-25) | `mode, durationMin, distanceKm, summary` |
| `nearby_pois` | `GET /api/pois/nearby` | `origin` (`lat,lng` or resort id), `category` (food, convenience), `limit=5` (walking only) | `name, nameJa, minutes, distanceM, coord, openingHours` |
| `crowd_and_snow` | `GET /api/crowd` + `GET /api/snow` | `date?` | per resort `crowdLevel, crowdScore, crowdReasons, summitDepthCm, baseDepthCm, newSnowPast24hCm, newSnowNext24hCm, newSnowNext72hCm, snowAsOf` |

- Prompt `plan_ski_day(start, date)`: origin → snow/crowd → rank → bus or walk → answer with times, and say bus times are timetable estimates.
- `snowAsOf` is the local time the snow figures are from. The API serves its last good snow report for up to 6 h when Open-Meteo is down (SPEC-snow-conditions), so both tool descriptions tell the model to say that time whenever it quotes snow figures. The rule is unconditional because the tools don't give the model the current time, so it could not tell an old report from a fresh one.
- Errors: a 4xx/5xx becomes a `ToolError` with the API's `detail` ("Hakuba API 422 on /api/rank: from must be 'lat,lng'"); a connection failure says the API is not reachable. The model reads these and can retry.
- Base URL: env `HAKUBA_API_URL`, default `http://127.0.0.1:8010` (the dev API; set the production URL to use the deployed API).

## Eval
`services/mcp/evals/trip_questions.json`: 100 trip questions in English, Chinese and Japanese (12 until v4, below). Each lists `required` tools, `optional` tools that are fine to call, and an `answer_regex`; an `any_of` group counts as one required tool met by any member, for facts two tools both give (crowd and snow come from `crowd_and_snow` or from `rank_resorts`). `run_eval.py` runs each through headless Claude Code (`claude -p … --mcp-config … --strict-mcp-config --tools "" --allowedTools "mcp__hakuba__*" --output-format stream-json`), reads the `tool_use` events, and prints:
- pass = every required tool called and the answer matches the regex;
- recall = required tools called / required tools; precision = distinct calls that were required or optional / distinct calls.
- the pass rate with its standard error (sample sd / √n, as in the search eval) and a 95% Wilson interval, which is the one to read with 12 questions: at 12 of 12 the standard error is 0, but the interval is 0.76–1.00; the cost per question in USD as the CLI reports it (`total_cost_usd`: what the API would have charged; the subscription is not billed per run), averaged over the runs that reported one, because a timed-out or crashed run reports none; and the median seconds per question.
- `--mlflow` (v3, 2026-11-16) also logs the run to a local MLflow store (`services/mcp/mlflow.db`, gitignored; `MLFLOW_TRACKING_URI` overrides it), experiment `mcp-agent-eval`: params (model, API, question ids, git sha), the summary numbers as metrics, the report, a per-question table, and one trace per question. A trace is the question as the root span with one child `TOOL` span per call (input, result, error status, timed by the CLI's event timestamps), plus a `passed` assessment with the missing tools as its rationale. So a change to a tool is measured as two runs side by side, and a failure is read in its trace, not guessed from the score. MLflow is in the `eval` dependency group (`uv sync --group eval`), which CI and Vercel don't install; its logging lives in `evals/mlflow_log.py` under `# pyright: basic`, because without MLflow installed every MLflow type is unknown.
- The report names a deployed API as "deployed API (HAKUBA_API_URL)", never its URL: `last_run.md` is committed and the repo is public.

### Eval log (production API unless a row says local, Claude Code default model, n = questions per run)
Results are as scored at the time; labels changed between runs, so read the rows as a sequence of decisions, not a trend. Under today's labels the baseline would score 8/8.

| Run | Code | Result | What the traces showed | Decision |
|---|---|---|---|---|
| baseline | e458f26 plus uncommitted eval logging (tools as on main) | 7/8 (0.53–0.98) | `plan-day-by-bus` skipped `rank_resorts` correctly: `crowd_and_snow` gives snow and crowd per resort. `drive-to-goryu` guessed the id `hakuba47-goryu` and retried. | The label was wrong. Now `search_place` and `next_buses` are required, plus one of `crowd_and_snow`/`rank_resorts` (`any_of`, after review: requiring `crowd_and_snow` alone would fail the `rank_resorts(sort="crowd")` path). Added `tool_errors` and 3 questions naming resorts. |
| before ×2 | 6fd47e5 | 11/11 and 11/11, 0 tool errors | Over all 30 runs so far, 7 calls passed a resort id; 1 failed. The new questions rarely reach `_resolve` (agents look Cortina up by name), so they test id guessing weakly. | Too rare to measure a fix at this n; make the failure cheap instead. |
| after ×2 | 605051c (error lists ids; descriptions say ids come from `rank_resorts`/`crowd_and_snow`) | 10/11 and 11/11, 0 tool errors | The failure called `rank_resorts` to find the id and answered from its drive time (6.6 min; `route` says 7.7). | 21/22 against 22/22 is noise (Fisher's exact p = 1.0); the revert rests on that one trace showing the mechanism. Reverted the wording, kept the error. |
| final | 5e921a0 | 11/11 (0.74–1.00), 0 tool errors, $0.045/question | No call hit an unknown id, so the new error text was never shown to the agent. | Same tool descriptions as the before runs (22 of 22). The error text is covered by its unit test only. |
| next_buses fix | fix/next-buses-null-arrival | old code: the new question fails (its 2 `next_buses` calls crash). Crash fix only: 12/12, but review found its answer wrong. With `departsFrom`: the question 3/3, full eval 12/12 (0.76–1.00), 0 tool errors | Found in production by Langfuse (4 `UnexpectedToolError`, 2026-11-16 09:36 UTC); the Vercel log traceback showed `arrivesAt[:16]` on null. The option was untimed because JR Hakuba has no published time on that trip: `departs` (15:18) is at Iwatake. Without that stop the agent said "15:18 from JR白馬駅". In the crash-fix run, `drive-to-cortina` guessed `hakuba-cortina`, saw the id-listing error for the first time and recovered. | `_to_minute` for both times, `departsFrom` (`firstStopName`, the stop `departs` is at), no estimated arrival (SPEC-bus-schedules). `untimed-bus-afternoon` must name 15:18 and Iwatake: its first regex passed the broken code by matching the echoed 15:00, its second passed the wrong stop. Its `basis` is "expected" (last season); if the new timetable makes that trip timed, the question stops testing the untimed path. |
| A1 ids re-run (local) | main 29433cb (tools and API unchanged through bff58e9; A1's `id`/`boardStopId` in), local API with in-process Valhalla | first run 11/12 with 3 tool errors; re-run 12/12 (0.76–1.00), 0 tool errors, $0.047/question | The first run's errors were `/api/snow` 502s: `api.open-meteo.com` timed out from this Mac and from production alike, so `crowd_and_snow` failed and `crowd-and-depth` could give no depth. No transcript showed a tool's text misleading the agent. | No tool text changed (SPEC-refactor R2.2). Re-ran the same code once Open-Meteo answered again. |
| v4: 100 questions | eval/trip-questions-100 (tools as on main 74c7972) | Broken tools: 2 of 91 tool questions passed with no data. Real run: 97/100 (0.92–0.99), recall 1.00, precision 0.98, 4 tool errors, $0.047/question; rescored after the label fixes 100/100 | Both broken-tools passes were echoes: the agent restated the question's 8 o'clock as `8:00`. The 3 real failures were correct answers: a non-breaking hyphen in `2026‑12‑13`, 鹿島槍 named as a landmark before 爺ヶ岳 (row 1 of its table was right), and a caveated outbound 17:30 in a last-bus refusal. The 4 tool errors were guessed resort ids (`hakuba-goryu`, `hakuba-cortina`), each recovered from the id list in the error. | Old `08:xx` regexes reject `:00` (the 2026-11-18 answers still pass). Fixed the 3 labels, widened hyphens in 41 regexes, accepted `’`. The default model is near the ceiling even at 100 questions: the gain is the interval (0.92–0.99 against 0.76–1.00), so a regression of a few questions now shows, an improvement mostly does not. |


## Acceptance Criteria
- [ ] `pytest`, `ruff check`, `ruff format --check`, `pyright` (strict) pass in `services/mcp`; tests use respx, no network.
- [ ] Each tool test checks the exact query params sent and the trimmed output; HTTP errors, non-JSON errors and connection errors map to `ToolError`.
- [x] The eval has run once against the real API, with its table saved in `services/mcp/evals/last_run.md` (2026-11-16, production API: 7/8, interval 0.53–0.98).
- [x] `--mlflow` logs the run and one trace per question; tested against a temporary SQLite store (the test is skipped where the `eval` group is not installed).

## Eval v4: 100 questions (2026-11-19)
**Goal:** an eval that can tell two versions apart. At 12 questions every recent run scores 12/12 (interval 0.76–1.00), so a tool change can only show up as a regression, never as an improvement. Done when `trip_questions.json` holds 100 questions whose regexes are shown to reject wrong answers, and one full run is logged to MLflow with its failures read in their traces.

**The set.**
- 100 questions in all: the 12 existing ones unchanged (their ids stay, so the old runs remain comparable question by question) plus 88 new ones. About a third each in en, zh, ja.
- Coverage, counting the main tool a question needs: `rank_resorts` ~20 (all 7 sorts, and each filter: `date`, `night_skiing`, `hakuba_valley_pass`, `max_drive_min`), `next_buses` ~18 (timed, untimed, no service that day, a stop that is not a station), `route` ~14 (drive and walk, resort ids and places), `nearby_pois` ~12 (food and convenience, from a resort and from a place), `crowd_and_snow` ~12 (fixed dates across the season), whole-day plans with 3+ tools ~14, and ~10 the tools cannot answer (a resort outside Hakuba, lift ticket refunds, a past date's snow): `required: []`, and the regex checks the answer says it has no data instead of inventing it.
- Some questions are meant to be hard: the set is useful only if today's tools fail some of them.
- Every question uses fixed dates in the 2026-27 season, never "today", so its answer does not move with the run date.

**Ground truth before regex.** Each regex is written from what the tools actually return for that question (called by hand through the hakuba tools, production API), not from what the answer should look like. A value is pinned only when it is stable:
- stable, so pinned: resort names, catalog stats (vertical, night skiing, pass), timetable times and stops, POI names, crowd levels (computed from the calendar), drive and walk minutes (with ±2 min, since the router can change).
- live, so only its form is checked: snow depths and new snow (a number with "cm" next to the right resort), and `snowAsOf`.
- Answers in zh may come in simplified or traditional characters, and a resort may be named in English, kanji or katakana: each regex accepts all the forms the tools return (白馬/白马, 駅/站, 八方/Happo).

**New fields per question** (the runner ignores them; `check` stays the report's short label):
- `regex_why`: one sentence on why a wrong answer does not match, naming the wrong answer it rules out.
- `positive`: a short correct answer, written from the ground truth, which must match.
- `negatives`: at least 2 realistic wrong answers, which must not match: the wrong resort or stop, a time off by one bus, the time echoed from the question, the right number with the wrong unit.
- `more_positives` (optional): further correct answers that must match, each one a correct answer a reviewer or a run showed the regex had failed, so a later tightening cannot fail it again.

**Checks, in order.**
1. Offline test (`tests/test_run_eval.py`, in CI): every question has the fields above and ids are unique; every regex compiles, matches its `positive`, and matches none of its `negatives`, nor the question text itself (an echo), nor a fixed "I couldn't reach the Hakuba API" answer.
2. Review: a fresh agent that has not seen this conversation checks the set against this spec and the tool docstrings in `server.py` (agent-skills:code-review-and-quality), looking for wrong labels and regexes a wrong answer could pass. Findings are fixed before any run.
3. Broken-tools run: the eval with `HAKUBA_API_URL` pointing at a closed port, so every tool call fails. Every question with `required` tools must fail its answer check; each one that passes is a regex an agent can satisfy from memory or guesswork, and is fixed. The questions with `required: []` are expected to pass here.
4. Real run: production API, Claude Code default model, `--workers 3 --mlflow`, report saved to `last_run.md`, and one row in the eval log. Every failure is read in its MLflow trace and recorded as either a label error (fix the question, say so in the log) or an agent or tool failure (keep it: that is what the eval is for). A regex is never loosened just to make a run pass.

**Decisions.**
- Kept the scorer as is (regex plus required tools); an LLM judge is out of scope: it would cost API credit and need its own eval.
- The 12 existing questions keep their labels, so the new run is compared with the 2026-11-18 run as paired results on those 12.
- Cost: the runs use the Claude Code subscription, not API credit. At the last measured $0.047 per question (as the CLI reports it), each full run is about $4.70 of API-equivalent usage, within the subscription's limits; two full runs (steps 3 and 4) plus re-runs of fixed questions.
- Risk: when the 2026-27 timetable is published, bus questions with `basis: expected` may change their times. Their `regex_why` names that, and the bus questions are the first to re-check after a timetable update.

**Acceptance.**
- [x] 100 questions; the offline test passes, with `pytest`, `ruff check`, `ruff format --check`, `pyright` in `services/mcp`.
- [x] Review findings fixed or answered in the PR.
- [x] Broken-tools run: no question with `required` tools passes its answer check.
- [x] Real run logged (MLflow, `last_run.md`, eval log row), each failure classified from its trace.

## Remote access on Vercel (v2, 2026-11-13)
**Goal:** the owner and friends use the same six tools from Claude chat in the desktop and phone apps, with the Mac off. Done when the owner adds the URL as a custom connector on claude.ai and a trip question is answered with the tools from the phone app.

**Auth decision.** claude.ai custom connectors connect from Anthropic's cloud and accept no auth or OAuth; a static header is a beta for some organizations only (claude.com/docs/connectors/building/authentication). The server is reached at `/mcp/<HAKUBA_MCP_TOKEN>`, so only people who were sent that link can use it. Accepted limits: one shared secret (rotating it cuts everyone off until they get the new link), the path shows in Vercel's request logs, and it guards the same public read-only data the site serves, so a leak costs Hobby quota, not data. Dropped for now: OAuth (an authorization server plus storage on serverless, for a handful of friends). Upgrade to OAuth with an allowlist if one friend must be revoked alone.

**Design.**
- `services/mcp/src/hakuba_mcp/remote.py`: an ASGI app serving the existing `mcp` object over Streamable HTTP, stateless, JSON responses. Each request gets its own session manager, so it needs no ASGI lifespan and no memory shared between instances.
- The token is compared in constant time. Unset or shorter than 32 characters → every request 404s (fail closed). A wrong path → 404, the same as an unknown page.
- `vercel.json`: a third service `mcp` (root `services/mcp/`), and a `/mcp/(.*)` rewrite before the web catch-all. The tools still call the API over HTTP: `HAKUBA_API_URL` is the production URL, set in Vercel's env.
- Env (Preview and Production): `HAKUBA_MCP_TOKEN` (32+ random characters), `HAKUBA_API_URL`.

**Acceptance.**
- [ ] Tests: no token set → 404; wrong token → 404; right token → `initialize` answers with server name `hakuba`, and `tools/list` returns the six tools. Same gates as above (pytest, ruff, pyright strict).
- [ ] On a deploy: `initialize` and `tools/list` over HTTPS, then `tools/call search_place` returns places from the live API; a wrong token returns 404.
- [ ] The site's production smoke suite still passes after the deploy.
- [ ] Owner check: the connector works in the phone app.

## Production tool traces in Langfuse (v3, 2026-11-16)
**Goal:** see how the deployed tools are used: calls per tool, latency (p50/p95), error rate, and which optional arguments the agents pass. That is the step after the eval: the eval says whether an agent *can* pick the right tools on a fixed question set, production traces say what friends' agents actually do. Done when a tool call from claude.ai shows in the Langfuse project as a `tool` observation with its duration.

**Decisions.**
- Langfuse Cloud, Japan region (`https://jp.cloud.langfuse.com`, AWS Tokyo, next to Vercel `hnd1`), Hobby plan: $0, 50k units a month, 30 days of data, no card (langfuse.com/pricing, checked 2026-11-16). Dropped: self-hosting (Postgres, ClickHouse, Redis and blob storage for a handful of friends), and OpenTelemetry to a generic backend (no LLM-aware views).
- The official `langfuse` SDK (5.2.0, OpenTelemetry-based) instead of hand-written OTLP: a dozen lines against a maintained client.
- One place: `TracedServer.call_tool` wraps every tool call in `tracing.tool_span`, so a new tool is traced without touching it.
- Privacy: a span holds the tool name, duration, the sorted names of the *declared* arguments the agent passed and, on failure, level `ERROR` with a summary: the error type, the invalid argument names, and the API status (`ToolError; Hakuba API 422`). Argument values, results and error messages stay out, because they are friends' hotels and coordinates, and the SDK's argument-error message quotes every argument. The exception is caught inside the span, so OpenTelemetry never records it with its message.
- Langfuse gets a `TracerProvider` of its own, not the global one: on the global one the MCP SDK's own `tools/call` span would be exported too (two spans per call, double the quota) and would carry the request's `_meta` trace id and baggage. Each tool span also starts from an empty context, so a client cannot choose its trace id.
- `langfuse` is imported on first use, so a cold start without keys doesn't pay its ~0.2 s.
- Off unless both `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set, so local runs, tests (an autouse fixture removes the keys) and CI send nothing. `remote.py` flushes after each answered request (in a worker thread), because Vercel may freeze the function right after it answers. A Langfuse outage never fails a tool call, but a flush blocks up to `LANGFUSE_TIMEOUT` seconds, so it is set to 2.
- Env (Production, and Preview to test): `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL=https://jp.cloud.langfuse.com`, `LANGFUSE_TRACING_ENVIRONMENT` (`production` / `preview`), `LANGFUSE_TIMEOUT=2`. The owner keeps the keys in `~/.config/jp_ski_map/langfuse.env`; never commit or print them.

**Acceptance.**
- [x] Tests (spans in memory, no network): a tool call is one `tool` observation named after the tool with its argument names and none of their values; a failed call is level `ERROR` with the summary, not the message; a `tools/call` over HTTP with a missing argument, an undeclared key and a client `traceparent`/`baggage` exports exactly one span, with no argument value in its attributes, status or events and a trace id of its own; the real client is not on the global provider; with no keys there is no client and tools still work; each answered remote request flushes once, a refused one never. The two privacy tests fail on the first version of this change.
- [ ] On a deploy with the keys: a `tools/call` shows in Langfuse within a minute, and the site's production smoke suite still passes.

## Boundaries
- Always: read-only GETs; trim responses; docstrings say when to use the tool and its units.
- Never: call the Anthropic API from the MCP tools themselves (Ask Maps' loop is the one capped exception, ADR-0007; the eval uses the Claude Code subscription and strips `ANTHROPIC_*` env vars); add a root `.mcp.json` (it would prompt every session in this repo); add an agent framework on top of the SDK.
- Cost: $0.
