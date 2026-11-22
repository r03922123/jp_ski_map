# hakuba-mcp

An MCP server that lets an AI agent plan a Hakuba ski day with tools: find a place, check snow and crowd, rank resorts, get the next shuttle bus, a drive or walk ETA, and nearby food or convenience stores. Each tool is a thin, read-only wrapper over the Hakuba Ski Map HTTP API that trims the response to ids, names, minutes, cm and levels. Spec: [SPEC-agent-tools.md](../../SPEC-agent-tools.md).

Tools: `search_place`, `rank_resorts`, `next_buses`, `route`, `nearby_pois`, `crowd_and_snow`. Prompt: `plan_ski_day`.

## Setup
The Mac's own uv 0.5.9 is too old for this lock, so use uv 0.9.30 through uvx:

```bash
cd services/mcp
uvx --from 'uv==0.9.30' uv sync
```

The server reads `HAKUBA_API_URL` (default `http://127.0.0.1:8010`, the dev API from SPEC.md's commands). To use the deployed API, set it to the production URL.

## Use it from Claude Code
Register it for your user only (no repo `.mcp.json`, so other sessions in this repo aren't prompted):

```bash
claude mcp add hakuba --scope user \
  --env HAKUBA_API_URL=<production URL, or http://127.0.0.1:8010 for a dev API> \
  -- "$PWD/.venv/bin/hakuba-mcp"
```

Then ask, for example, "I'm at JR Hakuba Station on 2026-12-26, which resort and which bus?" or run the `plan_ski_day` prompt.

## Use it from Claude chat (desktop and phone)
Production also serves these tools over Streamable HTTP at `https://<production URL>/mcp/<HAKUBA_MCP_TOKEN>` (`src/hakuba_mcp/remote.py`, SPEC-agent-tools v2). The token lives only in Vercel's environment (make one with `python3 -c "import secrets; print(secrets.token_urlsafe(32))"` and pipe it in with `printf %s`, so no `?`, `#`, `%` or newline ends up in it); whoever has the full link can use the tools, so share it only with friends.

On claude.ai: Settings → Connectors → Add custom connector → paste the full link, no OAuth settings. Connectors added on the web also work in the desktop and phone apps. A Free plan allows one custom connector.

## Production traces (Langfuse)
With `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` set (Vercel only), every tool call is sent to Langfuse as a `tool` observation: name, duration, argument names, and on failure the error type, the invalid argument names and the API status. Argument values, results and error messages are never sent. Without the keys nothing is sent. Details: SPEC-agent-tools v3.

## Checks
```bash
uvx --from 'uv==0.9.30' uv run pytest -q
uvx --from 'uv==0.9.30' uv run ruff check
uvx --from 'uv==0.9.30' uv run ruff format --check
uvx --from 'uv==0.9.30' uv run pyright
```

## Eval
`evals/trip_questions.json` has 100 questions (English, Chinese, Japanese), each with the tools it must call and an answer regex. `evals/run_eval.py` runs each one through headless Claude Code with only this server's tools, then prints pass/fail and tool-call precision and recall.

```bash
uvx --from 'uv==0.9.30' uv run python evals/run_eval.py --out evals/last_run.md
```

- It uses your Claude Code subscription login (run `claude` and `/login` once if it says "Login expired"). It removes `ANTHROPIC_*` variables first, so it never bills API credit.
- The API must be answering: `curl -s "$HAKUBA_API_URL/api/health"`.

To compare runs in MLflow (each question also gets a trace of its tool calls, with its pass/fail):

```bash
uvx --from 'uv==0.9.30' uv sync --group eval
HAKUBA_API_URL=<API URL> uvx --from 'uv==0.9.30' uv run python evals/run_eval.py --mlflow --out evals/last_run.md
uvx --from 'uv==0.9.30' uv run mlflow ui --backend-store-uri sqlite:///mlflow.db --port 5001
```

Last run: [evals/last_run.md](evals/last_run.md) (2026-11-19, deployed API, 100 questions: 97 of 100 passed, 100 of 100 after the label fixes in SPEC-agent-tools Eval v4).
