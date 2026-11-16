# Spec: agent-tools

> Module of [SPEC.md](SPEC.md). Depends on: the HTTP API (place-search, resort-ranking, bus-schedules, routing, poi-destinations, crowd-level, snow-conditions). Consumed by: any MCP client (Claude Code, Claude Desktop). Code: [services/mcp/](services/mcp/README.md).

## Objective
Let an LLM agent plan a Hakuba ski day by calling the existing API as tools. An MCP server (`hakuba-mcp`, the official `mcp` Python SDK, `MCPServer`, formerly FastMCP) wraps read-only GETs, trims each response to what a planner needs, and ships an eval that measures whether the agent picks the right tools.

## Tools
All places pass between tools as `"lat,lng"` strings. Times are minutes, snow is cm, crowd is a level. Every tool is `readOnlyHint`.

| Tool | Wraps | Inputs | Output (trimmed) |
|---|---|---|---|
| `search_place` | `GET /api/places/suggest` (local index + optional semantic retrieval) | `query`, `limit=5` | `name, nameJa, kind, coord, detail` |
| `rank_resorts` | `GET /api/rank` | `origin`, `sort` (drive_time, fresh_snow, snow_depth, crowd, terrain_size, vertical, price), `date?`, `night_skiing?`, `hakuba_valley_pass?`, `max_drive_min?`, `top=5` | `rank, resortId, name, sortValue, driveMin, summitDepthCm, newSnow24hCm, snowAsOf, crowdLevel` |
| `next_buses` | `GET /api/bus/options` | `origin`, `at?` (ISO, JST), `origin_name?`, `per_resort=2` | `status, nextServiceDate, basis, newerTimetablePending`, per resort `boardStop, walkMin, departs, arrives, rideMin, route, timed` |
| `route` | `GET /api/route` (+ `/api/resorts` to resolve an id) | `mode` (drive, walk), `origin`, `destination` (`lat,lng` or a resort id) | `mode, durationMin, distanceKm, summary` |
| `nearby_pois` | `GET /api/pois/nearby` | `origin` (`lat,lng` or resort id), `category` (food, convenience), `mode=walk`, `limit=5` | `name, nameJa, minutes, distanceM, coord, openingHours` |
| `crowd_and_snow` | `GET /api/crowd` + `GET /api/snow` | `date?` | per resort `crowdLevel, crowdScore, crowdReasons, summitDepthCm, baseDepthCm, newSnowPast24hCm, newSnowNext24hCm, newSnowNext72hCm, snowAsOf` |

- Prompt `plan_ski_day(start, date)`: origin → snow/crowd → rank → bus or drive → answer with times, and say bus times are timetable estimates.
- `snowAsOf` is the local time the snow figures are from. The API serves its last good snow report for up to 6 h when Open-Meteo is down (SPEC-snow-conditions), so both tool descriptions tell the model to say that time whenever it quotes snow figures. The rule is unconditional because the tools don't give the model the current time, so it could not tell an old report from a fresh one.
- Errors: a 4xx/5xx becomes a `ToolError` with the API's `detail` ("Hakuba API 422 on /api/rank: from must be 'lat,lng'"); a connection failure says the API is not reachable. The model reads these and can retry.
- Base URL: env `HAKUBA_API_URL`, default `http://127.0.0.1:8010` (the dev API; set the production URL to use the deployed API).

## Eval
`services/mcp/evals/trip_questions.json`: 8 trip questions in English, Chinese and Japanese. Each lists `required` tools, `optional` tools that are fine to call, and an `answer_regex`. `run_eval.py` runs each through headless Claude Code (`claude -p … --mcp-config … --strict-mcp-config --tools "" --allowedTools "mcp__hakuba__*" --output-format stream-json`), reads the `tool_use` events, and prints:
- pass = every required tool called and the answer matches the regex;
- recall = required tools called / required tools; precision = distinct calls that were required or optional / distinct calls.
- the pass rate with its standard error (sample sd / √n, as in the search eval) and a 95% Wilson interval, which is the one to read with 8 questions: at 8 of 8 the standard error is 0, but the interval is 0.68–1.00; the cost per question in USD as the CLI reports it (`total_cost_usd`: what the API would have charged; the subscription is not billed per run), averaged over the runs that reported one, because a timed-out or crashed run reports none; and the median seconds per question.

## Acceptance Criteria
- [ ] `pytest`, `ruff check`, `ruff format --check`, `pyright` (strict) pass in `services/mcp`; tests use respx, no network.
- [ ] Each tool test checks the exact query params sent and the trimmed output; HTTP errors, non-JSON errors and connection errors map to `ToolError`.
- [ ] The eval has run once against the real API, with its table saved in `services/mcp/evals/last_run.md`.

## Remote access on Vercel (v2, 2026-11-13)
**Goal:** the owner and friends use the same six tools from Claude chat in the desktop and phone apps, with the Mac off. Done when the owner adds the URL as a custom connector on claude.ai and a trip question is answered with the tools from the phone app.

**Auth decision.** claude.ai custom connectors connect from Anthropic's cloud and accept no auth or OAuth; a static header is a beta for some organizations only (claude.com/docs/connectors/building/authentication). The server is reached at `/mcp/<HAKUBA_MCP_TOKEN>`, so only people who were sent that link can use it. Accepted limits: one shared secret (rotating it cuts everyone off until they get the new link), the path shows in Vercel's request logs, and it guards the same public read-only data the site serves, so a leak costs Hobby quota, not data. Dropped for now: OAuth (an authorization server plus storage on serverless, for a handful of friends). Upgrade to OAuth with an allowlist if one friend must be revoked alone.

**Design.**
- `services/mcp/src/hakuba_mcp/remote.py`: an ASGI app serving the existing `mcp` object over Streamable HTTP, stateless, JSON responses. Each request gets its own session manager, so it needs no ASGI lifespan and no memory shared between instances.
- The token is compared in constant time. Unset or shorter than 32 characters → every request 404s (fail closed). A wrong path → 404, the same as an unknown page.
- `vercel.json`: a third service `mcp` (root `services/mcp/`), and a `/mcp/(.*)` rewrite before the web catch-all. The tools still call the API over HTTP: `HAKUBA_API_URL` is the production URL, set in Vercel, never in the repo.
- Env (Preview and Production): `HAKUBA_MCP_TOKEN` (32+ random characters), `HAKUBA_API_URL`.

**Acceptance.**
- [ ] Tests: no token set → 404; wrong token → 404; right token → `initialize` answers with server name `hakuba`, and `tools/list` returns the six tools. Same gates as above (pytest, ruff, pyright strict).
- [ ] On a deploy: `initialize` and `tools/list` over HTTPS, then `tools/call search_place` returns places from the live API; a wrong token returns 404.
- [ ] The site's production smoke suite still passes after the deploy.
- [ ] Owner check: the connector works in the phone app.

## Production tool traces in Langfuse (v3, 2026-11-16)
**Goal:** see how the deployed tools are used: calls per tool, latency (p50/p95), error rate, and which optional arguments the agents pass. That is the step after the eval: the eval says whether an agent *can* pick the right tools on 8 fixed questions, production traces say what friends' agents actually do. Done when a tool call from claude.ai shows in the Langfuse project as a `tool` observation with its duration.

**Decisions.**
- Langfuse Cloud, Japan region (`https://jp.cloud.langfuse.com`, AWS Tokyo, next to Vercel `hnd1`), Hobby plan: $0, 50k units a month, 30 days of data, no card (langfuse.com/pricing, checked 2026-11-16). Dropped: self-hosting (Postgres, ClickHouse, Redis and blob storage for a handful of friends), and OpenTelemetry to a generic backend (no LLM-aware views).
- The official `langfuse` SDK (5.2.0, OpenTelemetry-based) instead of hand-written OTLP: a dozen lines against a maintained client.
- One place: `TracedServer.call_tool` wraps every tool call in `tracing.tool_span`, so a new tool is traced without touching it.
- Privacy: a span holds the tool name, duration, the sorted argument *names* and, on failure, level `ERROR` with the error message. Argument values and results stay out, because they are friends' hotels and coordinates; an error message can still quote the one bad argument (e.g. `unknown place 'x'`).
- Off unless both `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set, so local runs, tests and CI send nothing. `remote.py` flushes after each answered request (in a worker thread), because Vercel may freeze the function right after it answers.
- Env (Production, and Preview to test): `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL=https://jp.cloud.langfuse.com`, `LANGFUSE_TRACING_ENVIRONMENT` (`production` / `preview`). The owner keeps the keys in `~/.config/jp_ski_map/langfuse.env`; never commit or print them.

**Acceptance.**
- [x] Tests (spans in memory, no network): a tool call is one `tool` observation named after the tool with its argument names and none of their values; a failed call is level `ERROR`; with no keys there is no client and tools still work; each answered remote request flushes once, a refused one never.
- [ ] On a deploy with the keys: a `tools/call` shows in Langfuse within a minute, and the site's production smoke suite still passes.

## Boundaries
- Always: read-only GETs; trim responses; docstrings say when to use the tool and its units.
- Never: call the Anthropic API from code (the API credit is reserved; the eval uses the Claude Code subscription and strips `ANTHROPIC_*` env vars); add a root `.mcp.json` (it would prompt every session in this repo); add an agent framework on top of the SDK.
- Cost: $0.
