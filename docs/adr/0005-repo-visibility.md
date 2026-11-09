# ADR-0005: Friends only this season, and the repo stays public for now

## Status

Decision 1 was accepted by the owner on 2026-11-09. Decision 2 is proposed: it replaces an earlier
recommendation to go private, which a fresh review disproved, and the owner confirms it at merge.

## Date

2026-11-09

## Context

The owner asked whether a private repo would make a public launch easier, and then what changes if
only the owner and friends use the app. Measured on 2026-11-09:

- The repo is public, with 0 forks and 0 stars.
- GitHub enforces `main`: a PR with the checks `api` and `web` is required, force pushes are off,
  and admins are included. Merges made on GitHub obey this too.
- Tailscale Funnel is on, and the app has no login. Anyone with the link can open it, and the
  link's hostname appears in [public certificate logs](https://tailscale.com/kb/1153/enabling-https/).
  `robots.ts` and `layout.tsx` only keep search engines away.
- 15 of the 100 stops in `data/bus_stops.json` still use My Maps pins with an unresolved licence,
  and the bus API returns stop coordinates through the same public link.
- `SPEC-deploy.md` already says the audience is the owner's friends.

Who can read the **repo** and who can use the **app** are separate questions, and most launch work
depends on the second.

| Launch item | Public repo, public launch | Public repo, friends only | Private repo, friends only |
|---|---|---|---|
| Search indexing, privacy note, downtime alert, Oracle VM | needed | not yet | not yet |
| Photon fallback (public instance is for demos) | replace | low volume, keep | low volume, keep |
| 2026-27 bus timetables | needed | needed | needed |
| 15 My Maps stops, licence unresolved | needs permission | in the repo and the app | out of the repo, still in the app |
| ODbL offer of the data | the repo does it | the repo does it | must be built |
| Licence links in the app and API | work | work | break until moved |
| GitHub enforcing PRs and CI on `main` | yes | yes | no |

What the sources say (a reading of the text, not legal advice):

- **Friends are still "Publicly".** [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) §1
  covers anyone other than you or people you control, so §4.3 (attribution) and §4.6 (offer the
  data to recipients) apply. §4.6 asks for the entire Derivative Database or all alterations, so an
  offer can't simply leave out the pins while they stay in those files.
- **GitHub Free has no branch protection on private repos.** The
  [REST docs](https://docs.github.com/en/rest/branches/branch-protection) list it for public
  repositories on Free, and for private ones only on paid plans. Paying would break the $0 rule.
- **Tailscale.** [The free plan](https://tailscale.com/pricing) allows 6 users.
  [Sharing a machine](https://tailscale.com/kb/1084/sharing) needs each friend to have a Tailscale
  account, and the docs don't say whether they count toward the 6.
  [Funnel](https://tailscale.com/kb/1223/funnel) describes no built-in login.

## Decision

### 1. This season the app is for the owner and friends

No public-launch work until the owner reopens it. The bus timetables aren't ready for strangers,
and friends-only removes most of the remaining work. Friends keep using the Funnel link, because it
needs nothing installed on their phones. The limit is accepted: anyone who gets the link can open
the app.

### 2. The repo stays public for now

A private repo doesn't deliver the benefit it seemed to, and its costs are concrete:

- **The pins stay reachable.** The app has no login and serves the stop coordinates, and an ODbL
  offer to friends would have to include those files.
- **GitHub stops enforcing PRs and CI on `main`.** A local pre-push hook can't replace this: it
  never runs on a merge made on GitHub, isn't in a fresh clone, and `--no-verify` skips it.
- **It costs process.** A protected `main` is part of the owner's global "Stop the bleeding" check,
  so going private moves the project back to that phase unless the global rule changes. The
  unattended-run profile also relies on that protection.
- **It needs new work.** The data offer, the road-network build method, four licence links, two
  tests that pin those URLs, and the map credits that phones can't see yet (`tasks/todo.md` J10).

## Alternatives Considered

### Private repo, friends only

Rejected for the reasons in Decision 2. It becomes worth reconsidering if the app gets a login,
since the data would then really be limited to invited people.

### Stay public and remove the 15 pins until permission arrives

The only option that actually stops distributing them, as far as new versions go; git history would
still hold them. It costs those 15 stops their locations in the app, which hurts friends who use
them. Left as a separate decision, tied to the permission requests in ADR-0004.

### Public repo and a public launch

Rejected for this season: timetables, the 15 pins and the Photon fallback aren't ready.

### Private code with a public data repo

Publishes the same pins, loses the same protection on the code repo, and adds a second repo to keep
in step.

### A paid GitHub plan for a protected private repo

Rejected by the $0 rule (`SPEC-deploy.md`).

### Tailscale sharing instead of Funnel

Only invited people get in, but every friend needs an account and an app on their phone. Worth
reconsidering if the link spreads further than intended.

## Consequences

- The 15 pins stay published in the repo and the app until the permission requests in ADR-0004
  resolve. Friends-only lowers how many people see them, not their licence status.
- If a public launch comes back, the first column of the table applies again.
- GitHub [disables scheduled workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows)
  in public repos after 60 days without activity, so `timetable-watch.yml` can stop during a quiet
  summer. Check it before each season.

## Next steps

1. Continue the permission requests in ADR-0004 next step 3. They, not the repo's visibility, settle
   the 15 pins.
2. If the owner still wants a private repo, write a new ADR first, covering the costs in Decision 2.
