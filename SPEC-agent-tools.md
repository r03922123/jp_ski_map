# Spec: agent-tools

> Module of [SPEC.md](SPEC.md). Depends on: the HTTP API (place-search, resort-ranking, bus-schedules, routing, poi-destinations, crowd-level, snow-conditions). Consumed by: any MCP client (Claude Code, Claude Desktop). Code: [services/mcp/](services/mcp/README.md).

## Objective
Let an LLM agent plan a Hakuba ski day by calling the existing API as tools. An MCP server (`hakuba-mcp`, the official `mcp` Python SDK, `MCPServer`, formerly FastMCP) wraps read-only GETs, trims each response to what a planner needs, and ships an eval that measures whether the agent picks the right tools.

## Tools
All places pass between tools as `"lat,lng"` strings. Times are minutes, snow is cm, crowd is a level. Every tool is `readOnlyHint`.

| Tool | Wraps | Inputs | Output (trimmed) |
|---|---|---|---|
| `search_place` | `GET /api/places/suggest` (local index + optional semantic retrieval) | `query`, `limit=5` | `name, nameJa, kind, coord, detail` |
| `rank_resorts` | `GET /api/rank` | `origin`, `sort` (drive_time, fresh_snow, snow_depth, crowd, terrain_size, vertical, price), `date?`, `night_skiing?`, `hakuba_valley_pass?`, `max_drive_min?`, `top=5` | `rank, resortId, name, sortValue, driveMin, summitDepthCm, newSnow24hCm, crowdLevel` |
| `next_buses` | `GET /api/bus/options` | `origin`, `at?` (ISO, JST), `origin_name?`, `per_resort=2` | `status, nextServiceDate, basis, newerTimetablePending`, per resort `boardStop, walkMin, departs, arrives, rideMin, route, timed` |
| `route` | `GET /api/route` (+ `/api/resorts` to resolve an id) | `mode` (drive, walk), `origin`, `destination` (`lat,lng` or a resort id) | `mode, durationMin, distanceKm, summary` |
| `nearby_pois` | `GET /api/pois/nearby` | `origin` (`lat,lng` or resort id), `category` (food, convenience), `mode=walk`, `limit=5` | `name, nameJa, minutes, distanceM, coord, openingHours` |
| `crowd_and_snow` | `GET /api/crowd` + `GET /api/snow` | `date?` | per resort `crowdLevel, crowdScore, crowdReasons, summitDepthCm, baseDepthCm, newSnowPast24hCm, newSnowNext24hCm, newSnowNext72hCm` |

- Prompt `plan_ski_day(start, date)`: origin → snow/crowd → rank → bus or drive → answer with times, and say bus times are timetable estimates.
- Errors: a 4xx/5xx becomes a `ToolError` with the API's `detail` ("Hakuba API 422 on /api/rank: from must be 'lat,lng'"); a connection failure says the API is not reachable. The model reads these and can retry.
- Base URL: env `HAKUBA_API_URL`, default `http://127.0.0.1:8011` (the Mac standby API, off since 2026-11-13).

## Eval
`services/mcp/evals/trip_questions.json`: 8 trip questions in English, Chinese and Japanese. Each lists `required` tools, `optional` tools that are fine to call, and an `answer_regex`. `run_eval.py` runs each through headless Claude Code (`claude -p … --mcp-config … --strict-mcp-config --tools "" --allowedTools "mcp__hakuba__*" --output-format stream-json`), reads the `tool_use` events, and prints:
- pass = every required tool called and the answer matches the regex;
- recall = required tools called / required tools; precision = distinct calls that were required or optional / distinct calls.

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

## Boundaries
- Always: read-only GETs; trim responses; docstrings say when to use the tool and its units.
- Never: call the Anthropic API from code (the API credit is reserved; the eval uses the Claude Code subscription and strips `ANTHROPIC_*` env vars); add a root `.mcp.json` (it would prompt every session in this repo); add an agent framework on top of the SDK.
- Cost: $0.
