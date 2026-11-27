---
name: new-worktree
description: Set up and run jp_ski_map inside a git worktree (a checkout other than the main one) - install dependencies, pick free ports, point the web app and e2e at your own servers. Use when starting work in a new worktree, when asked how to set one up, or before running the dev server or e2e from one.
---

# Work in a worktree

A worktree shares ports, Docker and Valhalla with the main checkout and with other sessions, so it
must not take their ports or restart their services.

## 1. Install dependencies

A new worktree has none:

```bash
uv sync --directory services/api
pnpm install --dir apps/web
```

Other Python projects (`services/mcp`, `pipeline`, `ml/*`) each have their own: run
`uvx --from 'uv==0.9.30' uv sync` inside the one you need.

## 2. Run servers on free ports

:8010 and :3000 belong to the main checkout. Pick free ports (check with `lsof -i :<port>`), then:

- API: start it on your port.
- Web: start it with `pnpm dev` (not plain `next dev`: `pnpm dev` copies the gitignored MapLibre
  worker first, and without it every map test times out), with `API_URL=http://127.0.0.1:<api port>`.
- e2e: set `E2E_BASE_URL=http://127.0.0.1:<web port>`. Without it e2e reuses whatever answers on
  :3000, which may be another checkout's code.

## 3. Shared services

- Valhalla (:8002) is shared by every checkout and is usually stopped. Routing work and the e2e
  route and trip-card specs need it: start it from the main checkout with
  `docker compose -f infra/docker-compose.yml up -d valhalla`.
- From a worktree's own folder, don't run `docker compose` or `scripts/serve-public.sh`.
- `pnpm build` is fine in a worktree. In the main checkout only `serve-public.sh` runs it.
