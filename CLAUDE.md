# jp_ski_map
- Active branch: none. Parked: none.
- Takeover phase: tidy (next when: follow-ups 1 and 2 are done)
- Cost must stay $0 (SPEC-deploy.md). Any paid API, cloud account, or service needs my OK first.
- SPEC.md is the module map; each module has its own SPEC-*.md.
- Production is Vercel Hobby (`hnd1`, SPEC-deploy Phase B). Deploy only with `scripts/deploy-vercel.sh` (preview; `--prod` for production), from a checkout that has `.vercel/project.json` and the built tiles. Smoke-test after each deploy: `PROD_URL=<url> pnpm exec playwright test -c e2e-prod/playwright.config.ts` in apps/web. Don't write the production URL into the repo: it's public.
- Vercel needs `PYTHONPATH=/var/task/src` (the bundle is too big for Vercel to install the package itself); the env vars are in SPEC-deploy Changes item 9.
- The Mac is the standby: Tailscale Funnel still serves the old link until friends move their saved lists. The API binds 127.0.0.1 only.
- A new worktree has no dependencies: run `uv sync` in services/api and `pnpm install` in apps/web.
- The main checkout serves the Mac standby (:3000, :8011) and the shared Valhalla (:8002). In a worktree: use free ports, set `API_URL` for the web server and `E2E_BASE_URL=http://127.0.0.1:<port>` for e2e, and don't run `docker compose` or `serve-public.sh`. In the main checkout, only `serve-public.sh` runs `pnpm build`.
