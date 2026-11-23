# ADR-0008: Publish the production URL as a $0 portfolio demo

## Status

Accepted by the owner on 2026-11-23 ("Yes, do it here"). Replaces
[ADR-0005](0005-repo-visibility.md) Decision 1's "no public-launch work" for one item: the URL may be
written in the repo. The rest of the public-launch column in ADR-0005 stays deferred.

## Date

2026-11-23

## Context

The owner wants the README to link the live app, so a hiring manager or an engineer can try it
without running anything. Until now the URL was kept out of the repo
([learning log, 2026-11-10](../learning-log.md)): strangers who find it spend the free allowances.
What a public link can cost, read on 2026-11-23:

- **Hosting.** Vercel Hobby never bills. Over an allotment, Functions stop for the rest of the
  30-day window ([Hobby plan](https://vercel.com/docs/plans/hobby)). So a traffic spike costs
  uptime, not money. Hobby is for personal, non-commercial use, which a portfolio demo is.
- **Abuse bound.** A firewall rule allows 300 requests per 60 s per IP on `/api/`, and a deny rule
  on `/` takes the site down in about 8 s. Both were tested at Checkpoint S
  ([SPEC-deploy.md](../../SPEC-deploy.md)). `/ask` and `/mcp/` are outside the rate rule.
- **Upstreams.** Map tiles come from OpenFreeMap, with no key. Open-Meteo is free for
  non-commercial use under 10,000 calls a day ([terms](https://open-meteo.com/en/terms)), and the
  snow lookup is cached for an hour. Photon's public instance is for light use: suggestions try our
  own index first, a full search goes to Photon, and a bucket in each instance holds calls to 1 a second.
- **The one paid path.** `POST /ask` calls Claude Haiku, but only once `ANTHROPIC_API_KEY` is in
  Vercel's env. The owner item in `tasks/todo.md` says it isn't yet, so `/ask` answers 503 and costs $0. Its
  own guards are weak: an Origin check that a script can fake, and 20 questions per IP per day per
  instance. The real cap is the Anthropic Console workspace limit ($5 a month,
  [ADR-0007](0007-automated-verification-and-capped-llm.md)).
- **Bus data.** ADR-0005 held strangers back partly because the timetables weren't ready. Only
  2025-26 tables exist; later dates are projected from them and labelled "Based on last season's
  timetable" with a note to check before going. A demo accepts labelled projections.
- **Secrets.** The MCP token stays secret. It is the part of `/mcp/<token>` that grants access, not
  the host, and `.claude/hooks/guard_mcp_token.py` still blocks committing it.

## Decision

1. The production URL goes in the README, with links that open a ready result.
2. The budget stays $0 a month for hosting, plus the existing $5 a month Ask cap.
3. The rule "never commit the production URL" ends. The rule for the MCP token stays.
4. `robots.txt` and the `noindex` tag stay. A demo is reached from the README, not from search.
5. The Anthropic key goes into Vercel only after the Console limit is set and auto-reload is off,
   because that limit is the only cap on `/ask` that a script can't get around.

## Alternatives considered

- **Vercel Pro, $20 a month.** More allowance, but it turns a spike into a bill. A demo doesn't need
  the uptime.
- **A custom domain, about $10–15 a year.** A nicer link. It removes no risk, so it can wait.
- **Self-hosting Photon.** Needed for a real public launch (ADR-0005), not for demo traffic.
- **Keep the URL out and share it by message only.** Then a reader of the repo can't try the app,
  which is the goal.

## Consequences

- A spike from a shared link can take the whole site down for up to 30 days, for friends too.
  Watch `vercel billing usage`, and use the kill switch if traffic looks like abuse.
- The 15 bus stops with My Maps pins stay as ADR-0005 describes. They were already public through
  the repo, so the link adds viewers, not a new distribution.
- Reviewers and the daily retro no longer treat the URL as a secret.
