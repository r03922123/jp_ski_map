---
name: deploy
description: Deploy jp_ski_map to Vercel (a preview, or production with --prod) and smoke-test the deploy. Use when asked to deploy, ship, release or publish the app, when asked how deploying works, or before running any `vercel` command.
---

# Deploy to Vercel

Production is Vercel Hobby, region `hnd1` (SPEC-deploy Phase B). The repo is public, so never write
the MCP token into a file, commit, PR or report. The production URL is public (ADR-0008).

## 1. Deploy

A push to main deploys production through CI's `deploy` job (SPEC-deploy Phase C, ADR-0009), unless
the repository variable `DEPLOY_PAUSED` is `true`. So a report that announces a merge to main says it
deploys production. The job stages a build, runs the smoke suite on it, and promotes it only on a pass.
A failed job leaves production on its last good build: read the job log, fix on main, or rerun.

By hand (a hotfix, a GitHub outage, or while the job is paused), deploy only with the script: it
uploads a temp folder built from `git archive HEAD`, so uncommitted files (`.env`, `.ux-evidence`,
`.run`) can't leave the machine.

```bash
scripts/deploy-vercel.sh          # preview
scripts/deploy-vercel.sh --prod   # production: say so in the report
```

- Run it from a checkout that has `.vercel/project.json` and the built tiles (both gitignored;
  the main checkout has them, a new worktree doesn't). Commit first: only `HEAD` is uploaded.
- `vercel` isn't on PATH; the script falls back to the npx copy by itself.
- Vercel needs `PYTHONPATH=/var/task/src`: the script puts a slim `valhalla` under `src/`
  (`scripts/vendor_valhalla.py`, which downloads the wheel). Without it every `/api` call returns
  500. The env vars are listed in SPEC-deploy Phase B, Changes item 9.
- The build log must not say "exceeds the standard size": then every new instance installs
  packages before it answers (SPEC-deploy, "Valhalla's share of the cold start").

## 2. Smoke-test after every deploy

In `apps/web`:

```bash
PROD_URL=<deploy URL> pnpm exec playwright test -c e2e-prod/playwright.config.ts
```

A protected preview also needs `VERCEL_AUTOMATION_BYPASS_SECRET` in the environment.

## Other `vercel` commands

Put the npx copy on PATH first:

```bash
PATH="$(dirname "$(ls ~/.npm/_npx/*/node_modules/.bin/vercel | head -1)"):$PATH" vercel <command>
```

`vercel curl <preview URL>` gets past preview protection without the bypass secret.

## After a rollback

`vercel rollback` turns off domain auto-assignment, and the next green push would promote past it.
Pause the job first: `gh variable set DEPLOY_PAUSED --body true`. Delete it once the fix is on main,
then push or deploy by hand: the fix's own run was skipped while paused.

## Don't

- Don't bring back the Mac standby (`scripts/serve-public.sh --funnel`) without asking the owner:
  it makes the Mac public. Production runs only on Vercel.
- Don't change the deploy script without running `scripts/test-deploy-vercel.sh` (not `sh …`:
  POSIX mode leaks per-test env vars).
