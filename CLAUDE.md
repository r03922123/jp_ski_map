# jp_ski_map
- Active branch: none. Parked: none.
- Takeover phase: tidy (next when: follow-ups 1 and 2 are done)
- Cost must stay $0 (SPEC-deploy.md). Any paid API, cloud account, or service needs my OK first.
- SPEC.md is the module map; each module has its own SPEC-*.md.
- The API binds 127.0.0.1 only; Tailscale Funnel exposes the web app.
- A new worktree has no dependencies: run `uv sync` in services/api and `pnpm install` in apps/web.
- The main checkout also serves production (:3000, :8011): don't run `pnpm build` there; run dev servers on another port.
