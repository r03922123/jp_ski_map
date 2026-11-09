# ADR-0006: Host Phase B on Vercel, with Valhalla inside the API

## Status

Proposed. The owner decides at merge. Replaces the Oracle choice for Phase B in `SPEC-deploy.md`,
the "Oracle VM: not yet" row of [ADR-0005](0005-repo-visibility.md) for friends-only use, and, after
cutover, ADR-0005 Decision 1's "friends keep using the Funnel link".

## Date

2026-11-09

## Context

The site is down whenever the owner's MacBook sleeps. `SPEC-deploy.md` planned one Oracle Always
Free VM for that. Measured and read on 2026-11-09:

- The stack uses about 0.5 GB and has no server-side user data. Saved places live in each browser,
  per origin.
- Valhalla looked like the reason a VM was needed: it runs as a long-lived HTTP server. But
  `pyvalhalla` 3.9.1 runs the same engine inside Python. With only the 5.9 MB Hakuba tiles it returned
  identical results on 120 of 120 requests against the live server, and the same codes on 5 errors.
- One `Actor` shared by threads crashed the process in 4 of 4 runs. With a lock, 0 wrong of 2000.
- Oracle's free A1 allowance was halved in 2026 (2 OCPU / 12 GB). A1 capacity is not guaranteed in
  the home region, and users report accounts disabled without warning.

## Decision

Deploy `apps/web` and `services/api` as one Vercel Hobby project using Services, in `hnd1`, with
Valhalla embedded in the API behind a lock. Deploys are explicit, through one script that uploads only
committed files plus the local tiles. A throwaway probe comes before any repo change, and a go/no-go
checkpoint comes before cutover. The HTTP backend stays permanently, so the Mac remains the standby.

**Build order:** the owner decided on 2026-11-09 to start now, while follow-ups 1 and 2 in
`docs/ARCHITECTURE.md` are still open. This is a recorded exception to the takeover order: the project
stays in "tidy", and what is left of those follow-ups waits on outside permissions and December re-checks.

## Alternatives Considered

### Oracle Always Free VM

No code change beyond containers, and in-memory limits keep working. Rejected as first choice: a VM to
patch, and a free tier that may not be obtainable or may be withdrawn. A candidate if Vercel is a no-go.

### AWS Lightsail, 1 GB ($7 a month)

The most predictable VM with a Japan region. Rejected while a $0 path exists. It needs the owner's OK
to break the $0 rule.

### Vercel with Valhalla in a Container Function

Beta runtime and an extra service, for no gain over embedding.

### Cloudflare Workers and Containers

Free Workers allow 10 ms of CPU per request. Containers need the $5 plan, and their docs offer no
region choice.

### Next.js on Vercel, API on a VM

Common, but search and routing still die with the VM, and the API must be opened to the internet.

### Automatic deploys, with tiles as a GitHub Release asset

Every merge would go live and use up the single rollback step, and the asset would be a public ODbL
distribution needing its own notice. Reconsider if deploys ever move to CI.

## Consequences

- In-memory rate limits and caches become per instance, so they are best effort. Fine for friends; a
  public launch must move them to shared storage first.
- Exceeding a Hobby allotment takes the whole site down for up to 30 days, with no bill. The Mac and
  Funnel are the standby, but not if the lock-out hits during a trip with the Mac at home.
- Friends' saved data doesn't move by itself, because `localStorage` is per origin. Saved lists move
  with the Share list link. Rider settings and recent searches may start empty.
- `pyvalhalla` joins the API's dependencies, and its lock becomes a rule any future change must keep.
- Deploying needs the local tiles, so only a machine that has run `infra/valhalla/build-hakuba.sh` can
  deploy.

## Next steps

1. Land this ADR and the spec in the repo (this change).
2. Done: the owner created the Vercel Hobby account.
3. Done 2026-11-09: Probe P and probe S0 passed. Results are in `SPEC-deploy.md`, Evidence.
4. Build the repo changes, then run Checkpoint S on a preview deployment.
