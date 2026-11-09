# jp_ski_map
- Active branch: none. Parked: none.
- Takeover phase: tidy (next when: follow-ups 1 and 2 are done)
- Cost must stay $0 (SPEC-deploy.md). Any paid API, cloud account, or service needs my OK first.
- SPEC.md is the module map; each module has its own SPEC-*.md.
- The API binds 127.0.0.1 only; Tailscale Funnel exposes the web app.
- A new worktree has no dependencies: run `uv sync` in services/api and `pnpm install` in apps/web.
- The main checkout serves production (:3000, :8011) and the shared Valhalla (:8002). In a worktree: use free ports, set `API_URL` for the web server and `E2E_BASE_URL=http://127.0.0.1:<port>` for e2e, and don't run `docker compose` or `serve-public.sh`. In the main checkout, only `serve-public.sh` runs `pnpm build`.
