# Spec: ask-maps (ask the map a question)

> Module of [SPEC.md](SPEC.md). Depends on: agent-tools (the five tools in `services/mcp`), the HTTP
> API. Consumed by: web-app. Drafted 2026-11-18.

## Objective

The in-app equivalent of Google Maps' **Ask Maps** for Hakuba: a skier types or pastes a question
in their own words and gets a short answer, the places it talks about pinned on the map, a source
for every fact, and one-tap actions (route, bus, save).

Examples it must handle (EN, 中文, 日本語):
- "Ramen within a 10-minute walk of my hotel that's open now"
- "Which resort has the most fresh snow today, and can I get there by bus before 9?"
- "白馬東急ホテルから一番空いているスキー場は？"
- "我住 Hakuba Tokyu，明天想滑八方，最早的公車幾點？"
- follow-up: "And which of those has night skiing?"

**What Google's version does, and what we copy** (research 2026-11-18, sources in the PR):

| Ask Maps (Google, launched 2026-03-12) | Ours |
|---|---|
| "Ask Maps" button under the search bar opens a sheet with suggested prompts | Same: an **Ask** button under the search box, 4 suggested prompts built from today's snow and the user's start |
| Conversational answer + a custom map of the options + directions, ETAs | Answer text + the cited places as pins (fit to view) + each pin's card with walk/bus ETA |
| Links to sources; "AI answers can be wrong" | Every sentence cites a place, a timetable or the snow report; the sheet says answers are estimates and may be wrong |
| Follow-ups refer to earlier results | Same, within one conversation (kept in the browser only) |
| Personalised from saved places, home, work | From "My hotel" and saved places, which already live in the browser; sent with the question, never stored on the server |
| Book, save, share, navigate | Route, bus, save (no booking: we have no booking data) |

**Done when**
1. On a preview deploy, the 40-question eval reports p50 ≤ 8 s and p95 ≤ 15 s to the last
   token, and the five example questions each return a cited answer whose pins open the existing
   place card (Playwright, stubbed and live).
2. The Ask eval (below) passes: pass^3 ≥ 0.9 on the 40-question set, **0 ungrounded places**, and
   the result is logged to MLflow with n and the Wilson interval.
3. Spend is capped and visible: the Anthropic Console workspace spend limit is set (the hard
   cap); Langfuse shows tokens and cost per question; when the API returns the spend-limit error,
   the sheet says Ask is paused this month (unit test with a fake client).

**Out of scope:** voice input, accounts or server-side history, booking, reviews (we have none),
ads, a vector database (1,000 places fit in one matrix; see SPEC-place-search v1.4).

## Design

**A tool loop over the tools we already have, not a new agent.** The five MCP tools
(`search_place`, `rank_resorts`, `next_buses`, `route`, `snow_conditions`; `nearby_pois` went on
2026-11-25, ADR-0010, and `crowd_and_snow` became `snow_conditions` on 2026-11-26, ADR-0011) are
trimmed for context and return errors the model can act on; through Claude Code's default model
they pass the agent-tools eval 12/12 (that says nothing yet about Haiku, see Eval). Ask calls them
through `await mcp.call_tool(name, args)`, not the bare functions, so argument validation, the
Langfuse tool span and `ToolError` handling stay identical to the connector's; a `ToolError`
goes back as a `tool_result` with `is_error: true`. One tool surface serves Claude chat and the
app. (The tools still reach the API over HTTP, as on the connector; fine at this scale.)

- Why an agent loop and not a fixed workflow (Anthropic, *Building effective agents*: start with a
  workflow): the questions combine 1 to 4 tools in orders that differ per question (search → bus;
  snow → rank → route; search → route), and the MCP eval shows the model picks them
  correctly. A router with one fixed chain per intent would need about 6 chains and still miss
  combinations. The loop is bounded instead: **at most 6 tool calls and 2 model turns after the
  last call**, then it answers with what it has.
- No multi-agent: one question needs one shared context; multi-agent costs about 15× the tokens
  of a chat (Anthropic, *multi-agent research system*).

**Grounding: pins are citations.** Today `search_place` returns no id and
`next_buses` returns a route name, so A1 first adds `id` (place, resort, stop) to the tool
outputs, then re-runs the agent-tools eval to show nothing regressed. `ask.py` then turns **each
list item** into its own `search_result` block with citations on (`source` =
`hakuba:place/<id>`, `hakuba:stop/<id>`, `hakuba:resort/<id>`; `title` = the readable name;
`content` = the trimmed fields). The final answer is plain text with citations, so:
- the pins on the map are exactly the places the answer cites (code reads the citations, not the
  model's prose);
- a place the model names without a citation is not pinned and is counted as ungrounded in the
  eval. The grader finds named places with a gazetteer: every `name`, `nameJa` and alias of the
  ~1,000 index entries and 10 resorts, matched by the place-search normaliser (`places/index.py`)
  over the answer text; a match whose id isn't cited is ungrounded;
- structured outputs are not used here, because they cannot be combined with citations.

**Model and cost.** Start with `claude-haiku-5-5` ($0.10 / $0.50 per MTok, cache reads $0.01,
platform pricing page, 2026-11-18), effort `low`, `max_tokens` 1,024, tools + system prompt
cached. Estimate per question: about 4 requests × 5k input tokens + 800 output tokens ≈
**$0.0025**, so 1,000 questions ≈ $2.50. Haiku 5.5 thinks adaptively by default and thinking is
billed as output, so A2 measures the real cost. A2 also runs a paired Haiku vs `claude-sonnet-5-5`
baseline on the same 40 questions (≈ $1 at Sonnet prices) before the model is fixed; Sonnet only
if the paired difference is significant. **Spend is the owner's decision** (SPEC.md "Never call the Claude API
from code" and the reserved credit): this module needs that rule changed to "only `services/mcp`
Ask, capped" (ADR-0007).

**Caps and abuse.** The hard cap is the Anthropic Console workspace spend limit ($5 a month,
set by the owner): it holds whatever the app does. In front of it: `/ask` accepts only requests
whose `Origin` is the site's own (no token in the page, so this stops casual reuse, not a
determined script, which the Console cap then bounds); a per-instance token bucket of 20
questions per IP per day (a copy of the API's `TokenBucket` pattern; per instance on Vercel, an
accepted limit as in SPEC-deploy); questions over 500 characters refused; `max_tokens` 1,024;
the step cap. Langfuse cost is for watching, not enforcing (its ingestion is batched).

**Where it runs.** `services/mcp/src/hakuba_mcp/ask.py`: `POST /ask`, mounted next to
`remote.py`; `vercel.json` routes `/ask` to the `mcp` service. Response: server-sent events (text
deltas, then `places`, then `done`) **if** A1's spike shows a Vercel Python function streams them
on a preview (unverified: `remote.py` uses JSON responses on purpose); otherwise one JSON
response and the sheet shows a progress line per tool call. The key `ANTHROPIC_API_KEY` lives only in Vercel env. Web:
`components/AskSheet.tsx` (button, suggestions, conversation, citations as chips that focus their
pin), using the existing `BottomSheet`, `PlaceCard` and map layers.

*A1 as built (2026-11-18):* `POST /ask` takes `{question, start?}` and returns one JSON response
`{answer: [{text, sources}], pins: [{source, kind, id, title, coord}], toolCalls}`. The SSE spike
was not run (it needs a preview deploy); it moves to A4, and JSON is the fallback until then.
Origins allowed: `PUBLIC_URL` and Vercel's `VERCEL_URL`, `VERCEL_BRANCH_URL` and
`VERCEL_PROJECT_PRODUCTION_URL`; none set = all refused. Only the local time goes in the
mid-conversation system message: the user's `start` is their own text, so it stays in the user
turn (a review found it would otherwise get operator authority). Once the 6 calls are spent the
next turns send `tool_choice: none`, and an answer with no text (tool call, `max_tokens`,
refusal) becomes "I couldn't finish an answer", never a blank sheet. Stop and resort pins carry
no coord (the tools return none); A3 places them from its own stop and resort data.
Spend limit: a limit we set returns 400 `invalid_request_error` "You have reached your specified
(workspace) API usage limits", the tier cap 429 with `error_code: enforced_spend_limit_reached`
(platform docs, rate-limits page, 2026-11-18); both give 503 "Ask is paused this month". Not yet
built: follow-ups (`/ask` takes no history; A3 adds it) and the agent-tools eval re-run after the
new ids (it drives the Claude Code CLI, which needs `/login`).

**Context engineering.** The system prompt (about 400 words, stable, cached) says: who the user is
(a skier in Hakuba), answer only from tool results, cite every fact, say times are timetable
estimates and snow is as of `snowAsOf`, answer in the user's language, keep it to 5 sentences.
Per question, the request adds the user's start (`My hotel` or the map pin) and the local time as a
mid-conversation system message, so the cached prefix stays the same.

**Privacy.** Question text, places and coordinates never go to Langfuse (the agent-tools v3 rule):
spans hold tool names, argument names, token counts, cost, latency and the grounding check. The
conversation stays in the browser (`localStorage`, like saved places) and is sent back with each
follow-up.

**Safety.** Tool results contain third-party text (OSM names, opening hours). They are data in
`search_result` blocks, the tools are read-only, and the answer is rendered as text with only
internal place links, so an injected instruction can at worst produce a wrong answer, which the
grounding check and the "may be wrong" label cover.

## Eval (before any prompt or model change)

`services/mcp/evals/ask_questions.json`: 40 questions, EN/ZH/JA, the 12 agent-tools questions plus
28 new ones written from the example list and from real friend questions as they come in (with
their consent, typed in by the owner; nothing is collected from logs). Each has required tools, an
answer regex and the expected place ids. Graders, all code: required tools called, regex, expected
places ⊆ pins, **ungrounded places = 0**. Run each question 3 times (pass^3, because a user sees one
try), report pass rate with n and the Wilson interval, cost per question and p50/p95 latency,
logged to MLflow with one trace per question. Read the failed transcripts before changing
anything. The runner is new (`evals/run_ask_eval.py` on `ask.py`; `run_eval.py` drives the Claude
Code CLI and can't be reused), sharing `mlflow_log.py`. Eval runs use the owner's API key and
count toward the cap (about $0.30 per Haiku run of 40 × 3).

## Tasks (each one PR, built in a fresh session from this file)

| # | Task | Check |
|---|---|---|
| A0 | Owner OK on spend; ADR-0007; set the Console spend limit | ADR merged |
| A1 | Ids in tool outputs (+ agent-tools eval re-run); `ask.py` loop via `mcp.call_tool`, `search_result` per item, step cap, Origin check, bucket, spend-limit message; SSE spike on a preview | unit tests with respx + a fake Anthropic client: citation → pins, uncited place not pinned, ToolError → `is_error`, step cap, spend-limit error; spike result written in this file |
| A2 | Eval set + gazetteer grader + `run_ask_eval.py`; Haiku vs Sonnet paired baseline | baseline logged with n, Wilson interval, cost, p50/p95 |
| A3 | Web `AskSheet` (button, suggestions, citations, pins, follow-ups) | Vitest + Playwright with a stubbed `/ask`; phone screenshot |
| A4 | Deploy preview, eval against it, production | production smoke + the 5 example questions |

## Boundaries
- Always: cite every fact; label estimates; keep question text out of logs and traces; cap spend.
- Ask first: raising the cap; a larger model as the default; storing conversations on a server.
- Never: an answer pin that no tool returned; write tools (Ask stays read-only); scrape Google
  Maps or use Google's Maps grounding (terms and cost).
