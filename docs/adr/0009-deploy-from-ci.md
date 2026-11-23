# ADR-0009: Deploy every green merge to main from CI

## Status

Accepted by the owner on 2026-11-23 ("Accept ADR-0009"). It replaces three parts of
[ADR-0006](0006-vercel-phase-b.md): the Decision's "Deploys are explicit, through one script", the
rejected alternative "Automatic deploys, with tiles as a GitHub Release asset", and the consequence
"only a machine that has run `infra/valhalla/build-hakuba.sh` can deploy". The rest of ADR-0006
stays.

## Date

2026-11-23

## Context

A merge to main doesn't reach users until someone runs `scripts/deploy-vercel.sh --prod` on the Mac.
`vercel.json` sets `"git": { "deploymentEnabled": false }`, because Vercel's own build has no routing
tiles. The 5.9 MB `valhalla_tiles.tar` is gitignored and exists only on a machine that ran
`infra/valhalla/build-hakuba.sh`.

The cost shows today. PR #131 merged at 11:04 UTC, and later that day production answers
`/api/health` and `/api/resorts` with 200 but `/api/ski-lines` with 404 (measured with `curl`).

ADR-0006 rejected automatic deploys for two reasons. Both are weaker now:

- **"Every merge would go live and use up the single rollback step."** Hobby rolls back one
  deployment only, and a rollback turns off automatic domain assignment until someone runs
  `vercel promote` ([Instant Rollback](https://vercel.com/docs/instant-rollback)). A staged production
  build avoids the rollback: `vercel deploy --prod --skip-domain` builds for production without
  moving the production domain ([deploy](https://vercel.com/docs/cli/deploy)). `vercel promote` then
  moves the domain to that same build, and "it doesn't require a rebuild"
  ([promoting](https://vercel.com/docs/deployments/promoting-a-deployment)). A build that fails the
  smoke suite never serves users, so nothing needs rolling back.
- **"The asset would be a public ODbL distribution needing its own notice."** The repo has been
  public since 2026-10-31 and already publishes ODbL files with `DATA-LICENSES.md` as their notice.
  The tiles need one more row and a notice in the release text.

The smoke suite exists. `apps/web/e2e-prod/smoke.spec.ts` runs 5 tests against a deployed URL
(headers, place search, bus, drive and walk routes) and sends `VERCEL_AUTOMATION_BYPASS_SECRET`
when it is set.

Limits, read on 2026-11-23:

- Vercel Hobby allows 100 deployments a day ([limits](https://vercel.com/docs/limits)). This repo
  merges a handful of PRs a day.
- GitHub-hosted runners are free for public repositories
  ([billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)). Free
  accounts get environments, branch rules and environment secrets on public repositories
  ([environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)).
- Secrets aren't passed to workflows triggered from a fork
  ([secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)).
- Vercel has no OIDC login for GitHub Actions, so CI needs a stored Vercel token
  ([GitHub Actions guide](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel)).
- A release asset must be under 2 GiB
  ([releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)).

## Decision

A `deploy` job in `.github/workflows/ci.yml` deploys each push to main after every other CI job
passes. It stages a production build, runs the smoke suite against it, and promotes it only when
the suite passes. Details are in [SPEC-deploy.md](../../SPEC-deploy.md), "Phase C".

1. **Trigger.** Push to main only, with `needs:` on every other job. Pull requests never deploy.
2. **Tiles.** The job downloads `valhalla_tiles.tar` from the GitHub release `tiles-<first 12 hex
   of the hash>`. The hash comes from the committed `infra/valhalla/hakuba-tiles.sha256`, so the
   commit picks its tiles. The script's hash check stays the guard.
3. **Stage, test, promote.** `scripts/deploy-vercel.sh --staged` runs
   `vercel deploy --prod --skip-domain` and prints the deployment URL. The smoke suite runs against
   that URL. On a pass, and only if the run's commit is still the tip of main, `vercel promote <url>
   --yes` moves the production domain. A check then confirms the domain serves that deployment. On a
   fail, the job fails and production keeps the last good build.
4. **Secrets.** `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` and
   `VERCEL_AUTOMATION_BYPASS_SECRET` live in a GitHub environment `production` that only `main` may
   use. Each secret goes to the one step that needs it. The token is scoped to this project if Hobby
   offers that scope, and to the account if not.
5. **One deploy at a time.** `concurrency: production` with `cancel-in-progress: false`. GitHub
   cancels a waiting run that a newer push replaces. The tip-of-main check stops an older run that
   reaches the job late, or a rerun, from promoting old code.
6. **A pause switch.** The job skips while repository variable `DEPLOY_PAUSED` is `true`. Set it after
   a `vercel rollback`, or the next green push promotes past the rollback.
7. **The script stays.** `scripts/deploy-vercel.sh --prod` from the Mac remains for a hotfix or a
   GitHub outage.

## Alternatives Considered

### Keep manual deploys

No new secrets. Rejected because merged work waits for a person with the Mac, as #131 shows, and
only that Mac can deploy.

### Vercel's Git integration

Vercel builds from the repo, which has no tiles. Routing would fail on every request.

### Build the tiles in CI

The build takes about 10 minutes (`ci.yml` comment) and reads `chubu-latest.osm.pbf`, which changes
daily. Its hash would never match the committed one, so the tile check would have nothing to check.

### Deploy a preview, then promote it

Vercel promotes a preview "through a complete rebuild" with production environment variables
([promoting](https://vercel.com/docs/deployments/promoting-a-deployment)). The build that passed the
smoke suite would not be the build that ships.

### Deploy to production, roll back on a failed smoke run

Users get the bad build while the suite runs, and the rollback turns off domain assignment for every
later deploy until someone runs `vercel promote`.

## Consequences

- A green merge to main reaches users without anyone at the Mac. The Mac is needed only to build new
  tiles.
- A smoke test that fails because of an upstream (Photon or Open-Meteo) holds the deploy. Rerun the
  job. Production stays on the last good build meanwhile.
- Every merge to main is a production deploy, so a report that announces a merge says so.
- A long-lived Vercel token is stored in GitHub. Anyone who can push to main can deploy, which today
  is the owner only.
- The tiles become a public download under ODbL, with the notice in the release text and a row in
  `DATA-LICENSES.md`.
- Third-party actions and npm packages (the Vercel CLI, Playwright) run on the same runner as the
  token. Actions are pinned to a commit SHA, the CLI to a version, and the token reaches only the
  deploy and promote steps.
- A Playwright trace holds the bypass header, so CI turns traces off and never uploads
  `test-results/`.
- Not checked: whether a staged production URL sits behind Vercel Deployment Protection. The smoke
  suite sends the bypass secret either way, so the flow works in both cases.

## Next steps

1. Done 2026-11-23: the owner accepted this ADR.
2. The owner creates the Vercel token and adds the four secrets to the `production` environment.
3. The owner publishes release `tiles-3ecc1a50b85c` with the current tar and the ODbL notice.
4. One PR makes the changes listed in SPEC-deploy Phase C, "Changes to the repo".
5. The first run of the job must leave `/api/ski-lines` answering 200 in production.
