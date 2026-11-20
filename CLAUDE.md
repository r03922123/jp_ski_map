# jp_ski_map
Takeover phase: tidy (next when: the remaining architecture follow-ups are complete)
- Status: `tasks/todo.md` and the git log. SPEC.md is the module map; each module has its own SPEC-*.md.
- Run checks inside each project, as CI does (`.github/workflows/ci.yml`): from the repo root, pytest and pyright find
  no config. API: `uv run --directory services/api --frozen` + `ruff check`, `ruff format --check`, `pyright`,
  `pytest -q`, `python -m hakuba_api.data.validate` (services/mcp: the first four). Web: `pnpm --dir apps/web exec biome ci`
  (`pnpm lint` rewrites files), `typecheck`, `test`, and `build` in a worktree only. Deploy script:
  `scripts/test-deploy-vercel.sh` (not `sh …`: POSIX mode leaks per-test env vars); hook: `scripts/test-guard-mcp-token.sh`. One test: `uv run --directory services/api --frozen pytest tests/test_health.py -q`,
  `pnpm --dir apps/web test tests/PinCard.test.tsx`, `pnpm --dir apps/web e2e e2e/map.spec.ts`.
- e2e starts or reuses whatever answers on :8010 and :3000, so point `E2E_BASE_URL` at your own server, and add
  `E2E_PROD=1` against `next start` or a deploy.
- Start the web server with `pnpm dev`: it copies the gitignored MapLibre worker first, and without it every map test
  times out. Turbopack can serve a stale `globals.css` after a restart: grep the served CSS before trusting a
  screenshot, and `rm -rf apps/web/.next/dev` if it's old.
- apps/web is Next 16, whose APIs differ from training data: read `apps/web/node_modules/next/dist/docs/` before
  writing Next code (the same warning is in apps/web/AGENTS.md).
- To change a Python dependency, run `uvx --from 'uv==0.9.30' uv lock` in that project: this Mac's uv 0.5.9
  rewrites the whole lock.
- main is protected: changes land through a PR with CI green, committed with the repo-local noreply identity.
  GitHub deletes merged branches, so check the PR is still open before pushing to it.
- Procedures are skills; invoke them with the Skill tool: `deploy` (Vercel preview or production, smoke test,
  `vercel` commands) and `new-worktree` (dependencies, free ports, `API_URL`, `E2E_BASE_URL`, shared services). Production runs only on
  Vercel; `scripts/serve-public.sh --funnel` makes the Mac public, so ask the owner first.
- MCP for Claude chat: production serves the tools at `/mcp/<HAKUBA_MCP_TOKEN>` (SPEC-agent-tools v2). The token lives
  only in Vercel's env and the owner's `~/.config/jp_ski_map/mcp-connector-url.txt`; never commit or print it, nor the
  production URL (the repo is public). `.claude/hooks/guard_mcp_token.py` denies reading that file and committing a
  token-shaped path.
- ML experiments: `ml/search` (embedding server on :8032, fine-tune, evals → local MLflow), `ml/timetable_vlm` (local VLM drafts, never served), `services/mcp` (agent tools). Each is its own uv project; use `uvx --from 'uv==0.9.30' uv sync`. Semantic search is off unless the API has `HAKUBA_SEMANTIC_URL`. Only one model trains at a time: two at once swap the 16 GB Mac to a halt.
- Valhalla (:8002) is shared by every checkout and is stopped: start it from the main checkout with `docker compose -f infra/docker-compose.yml up -d valhalla` when routing work or the e2e route, poi and trip-card specs need it. In a worktree, see the `new-worktree` skill.
