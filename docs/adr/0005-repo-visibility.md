# ADR-0005: Friends only this season, and a private repo once the licence links move

## Status

Accepted by the owner on 2026-11-09. Changing the repository's visibility still needs the owner's
separate OK, after next steps 1 and 2.

## Date

2026-11-09

## Context

The owner asked whether a private repo would make a public launch easier, and then what changes if
only the owner and friends use the app. Measured on 2026-11-09:

- The repo is public, with 0 forks and 0 stars, and `main` is protected.
- Tailscale Funnel is on, with no password: anyone who has the link can open the app. `robots.ts`
  and `layout.tsx` only keep search engines away.
- `SPEC-deploy.md` already says the audience is the owner's friends.
- CI used 87 runs and 134 wall-clock minutes since 2026-10-31. Billing counts each job separately,
  so the billed figure would be somewhat higher.

Two questions look like one: who can read the **repo**, and who can use the **app**. Most launch
work depends on the second.

| Launch item | Public repo, public launch | Public repo, friends only | Private repo, friends only |
|---|---|---|---|
| Search indexing, privacy note, downtime alert, Oracle VM | needed | not yet | not yet |
| Photon fallback (public instance is for demos) | replace | low volume, keep | low volume, keep |
| 2026-27 bus timetables | needed | needed | needed |
| 15 My Maps stops, licence unresolved | needs permission | still published on GitHub | strangers can't download them; still unresolved |
| ODbL offer of the data | the repo does it | the repo does it | needs another way |
| Branch protection on `main` | yes | yes | no |
| CI on standard runners | free | free | $12 of usage a month (about 2,000 Linux minutes) |

What the sources say (a reading of the text, not legal advice):

- **Friends count as "Publicly".** [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) §1
  covers anyone other than you or people you control. So §4.3 (attribution) and §4.6 (offer the
  data to recipients) still apply to friends, but the offer is owed only to those recipients. Only
  a tool the owner alone uses is outside both.
- **GitHub Free has no branch protection on private repos.** The
  [REST docs](https://docs.github.com/en/rest/branches/branch-protection) list it for public
  repositories on Free, and for private ones only on paid plans. Paying would break the $0 rule.
- **Actions can't bill by surprise.** On [GitHub Free](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
  private repos get $12 of usage a month, and an account with no payment method is blocked at
  the limit instead of charged.
- **Going private is cheap here.** [GitHub erases stars and watchers and detaches forks](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility),
  and this repo has none of those.
- **Tailscale.** [The free plan](https://tailscale.com/pricing) allows 6 users.
  [Sharing a machine](https://tailscale.com/kb/1084/sharing) needs each friend to have a Tailscale
  account, and the docs don't say whether they count toward the 6.
  [Funnel](https://tailscale.com/kb/1223/funnel) describes no built-in login.

## Decision

### 1. This season the app is for the owner and friends

No public-launch work until the owner reopens it. The bus timetables aren't ready for strangers,
and friends-only removes most of the remaining work.

### 2. The repo goes private, after the licence links move

Friends-only is what removes the work. Going private adds one real benefit: strangers can no longer
download the 15 My Maps pins or the rest of the data files. That is worth losing GitHub's branch
protection, because this is a one-person repo and a local hook can stop the main accident it guards
against. The move is also easy to undo.

### 3. Friends keep using the Funnel link

It needs nothing installed on their phones, and that matters more than a stronger lock for a small
trusted group. The limit is accepted: a forwarded link lets anyone in. An invite code would need its
own spec.

## Alternatives Considered

### Stay public and friends-only

Keeps branch protection and meets the ODbL offer for free. Rejected for now because the data files,
including the 15 unlicensed pins, stay downloadable by anyone. It is the fallback if the local hook
proves too weak.

### Public repo and a public launch

Rejected for this season: timetables, the 15 pins and the Photon fallback aren't ready.

### Private code with a public data repo

Keeps the ODbL offer simple, but it would publish the same 15 pins, the code repo still loses
branch protection, and there would be two repos to keep in step.

### Keep the private repo protected on a paid plan

Rejected by the $0 rule (`SPEC-deploy.md`).

### Tailscale sharing instead of Funnel

Only invited people get in, but every friend needs an account and an app on their phone.

## Consequences

- If a public launch comes back, the items in the table return, and the repo should go public
  again first, so that the ODbL offer and branch protection return with it.
- Nothing already published can be recalled. Copies made while the repo was public keep their MIT
  licence, and the licence status of the 15 pins doesn't change.
- Pushes to `main` are no longer blocked by GitHub, which is an exception to the project baseline
  of a protected `main`.
- Friends still see the 15 pins in the app, so the permission requests in ADR-0004 stay open.

## Next steps

Before the switch:

1. **Move the licence links off GitHub.** `apps/web/src/lib/map-config.ts:6` and
   `services/api/src/hakuba_api/main.py:63` point at `DATA-LICENSES.md` on GitHub, and they would
   404 once the repo is private. Serve the licence notes from the app, and link the ODbL data files
   there as the §4.6 offer to friends.
2. **Add a local pre-push hook** that refuses pushes to `main`.

The switch and after:

3. The owner makes the repo private, then confirms CI still runs.
4. Update the project's `CLAUDE.md` with the baseline exception and the current visibility.
