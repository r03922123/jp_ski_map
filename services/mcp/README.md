# hakuba-mcp

An MCP server that lets an AI agent plan a Hakuba ski day with tools: find a place, check snow and crowd, rank resorts, get the next shuttle bus, a drive or walk ETA, and nearby food or convenience stores. Each tool is a thin, read-only wrapper over the Hakuba Ski Map HTTP API that trims the response to ids, names, minutes, cm and levels. Spec: [SPEC-agent-tools.md](../../SPEC-agent-tools.md).

Tools: `search_place`, `rank_resorts`, `next_buses`, `route`, `nearby_pois`, `crowd_and_snow`. Prompt: `plan_ski_day`.

## Setup
The Mac's own uv 0.5.9 is too old for this lock, so use uv 0.9.30 through uvx:

```bash
cd services/mcp
uvx --from 'uv==0.9.30' uv sync
```

The server reads `HAKUBA_API_URL` (default `http://127.0.0.1:8011`, the Mac standby API, which is off since 2026-11-13: point it at the production URL or a dev API on :8010).

## Use it from Claude Code
Register it for your user only (no repo `.mcp.json`, so other sessions in this repo aren't prompted):

```bash
claude mcp add hakuba --scope user \
  --env HAKUBA_API_URL=http://127.0.0.1:8011 \
  -- "$PWD/.venv/bin/hakuba-mcp"
```

Then ask, for example, "I'm at JR Hakuba Station on 2026-12-26, which resort and which bus?" or run the `plan_ski_day` prompt.

## Use it from Claude chat (desktop and phone)
Production also serves these tools over Streamable HTTP at `https://<production URL>/mcp/<HAKUBA_MCP_TOKEN>` (`src/hakuba_mcp/remote.py`, SPEC-agent-tools v2). The token lives only in Vercel's environment (make one with `python3 -c "import secrets; print(secrets.token_urlsafe(32))"` and pipe it in with `printf %s`, so no `?`, `#`, `%` or newline ends up in it); whoever has the full link can use the tools, so share it only with friends.

On claude.ai: Settings → Connectors → Add custom connector → paste the full link, no OAuth settings. Connectors added on the web also work in the desktop and phone apps. A Free plan allows one custom connector.

## Checks
```bash
uvx --from 'uv==0.9.30' uv run pytest -q
uvx --from 'uv==0.9.30' uv run ruff check
uvx --from 'uv==0.9.30' uv run ruff format --check
uvx --from 'uv==0.9.30' uv run pyright
```

## Eval
`evals/trip_questions.json` has 8 questions (English, Chinese, Japanese), each with the tools it must call and an answer regex. `evals/run_eval.py` runs each one through headless Claude Code with only this server's tools, then prints pass/fail and tool-call precision and recall.

```bash
uvx --from 'uv==0.9.30' uv run python evals/run_eval.py --out evals/last_run.md
```

- It uses your Claude Code subscription login (run `claude` and `/login` once if it says "Login expired"). It removes `ANTHROPIC_*` variables first, so it never bills API credit.
- The API must be answering: `curl -s 127.0.0.1:8011/api/health`.

Last run: not yet recorded (the headless CLI's login had expired when this was built; see `evals/last_run.md` once it runs).
