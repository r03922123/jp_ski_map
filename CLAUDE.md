# jp_ski_map
- Status: `tasks/todo.md` and the git log. SPEC.md is the module map; each module has its own SPEC-*.md.
- Run checks inside each project, as CI does (`.github/workflows/ci.yml`): from the repo root, pytest and pyright find
  no config. API: `uv run --directory services/api --frozen` + `ruff check`, `ruff format --check`, `pyright`,
  `pytest -q`, `python -m hakuba_api.data.validate` (services/mcp: the first four). Web: `pnpm --dir apps/web exec biome ci`
  (`pnpm lint` rewrites files), `typecheck`, `test`, and `build` in a worktree only. Deploy script:
  `sh scripts/test-deploy-vercel.sh`. One test: `uv run --directory services/api --frozen pytest tests/test_health.py -q`,
  `pnpm --dir apps/web test tests/PinCard.test.tsx`, `pnpm --dir apps/web e2e e2e/map.spec.ts`.
- e2e starts or reuses whatever answers on :8010 and :3000; in the main checkout :3000 is the standby build, so point
  `E2E_BASE_URL` at your own server, and add `E2E_PROD=1` against `next start` or a deploy.
- Start the web server with `pnpm dev`: it copies the gitignored MapLibre worker first, and without it every map test
  times out. Turbopack can serve a stale `globals.css` after a restart: grep the served CSS before trusting a
  screenshot, and `rm -rf apps/web/.next/dev` if it's old.
- apps/web is Next 16, whose APIs differ from training data: read `apps/web/node_modules/next/dist/docs/` before
  writing Next code (the same warning is in apps/web/AGENTS.md).
- To change a Python dependency, run `uvx --from 'uv==0.9.30' uv lock` in that project: this Mac's uv 0.5.9
  rewrites the whole lock.
- main is protected: changes land through a PR with CI green, committed with the repo-local noreply identity.
  GitHub deletes merged branches, so check the PR is still open before pushing to it.
- Cost must stay $0 (SPEC-deploy.md). Any paid API, cloud account, or service needs my OK first.
- Production is Vercel Hobby (`hnd1`, SPEC-deploy Phase B). Deploy only with `scripts/deploy-vercel.sh` (preview; `--prod` for production), from a checkout that has `.vercel/project.json` and the built tiles. Smoke-test after each deploy: `PROD_URL=<url> pnpm exec playwright test -c e2e-prod/playwright.config.ts` in apps/web (a protected preview also needs `VERCEL_AUTOMATION_BYPASS_SECRET`). Don't write the production URL into the repo: it's public.
- Vercel needs `PYTHONPATH=/var/task/src` (the bundle is too big for Vercel to install the package itself); the env vars are in SPEC-deploy Phase B Changes item 9.
- The Mac is the standby: Tailscale Funnel still serves the old link until friends move their saved lists. The API binds 127.0.0.1 only.
- A new worktree has no dependencies: run `uv sync` in services/api and `pnpm install` in apps/web.
- ML experiments (owner-approved 2026-11-11): `ml/search` (embedding server on :8032, fine-tune, evals → local MLflow), `ml/timetable_vlm` (local VLM drafts, never served), `services/mcp` (agent tools). Each is its own uv project; use `uvx --from 'uv==0.9.30' uv sync`. Semantic search is off unless the API has `HAKUBA_SEMANTIC_URL`. Only one model trains at a time: two at once swap the 16 GB Mac to a halt.
- The main checkout serves the Mac standby (:3000, :8011) and the shared Valhalla (:8002). In a worktree: use free ports, set `API_URL` for the web server and `E2E_BASE_URL=http://127.0.0.1:<port>` for e2e, and don't run `docker compose` or `serve-public.sh`. In the main checkout, only `serve-public.sh` runs `pnpm build`.
