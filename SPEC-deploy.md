# Spec: deploy

> Module of [SPEC.md](SPEC.md). Depends on: every server module (it hosts them). Consumed by: friends' browsers.
> Added 2026-10-31 (v1.5); Phase B replaced 2026-11-09 (v1.6). Decisions: zero cost; **Phase A** = this Mac
> + Tailscale Funnel now, **Phase B** = Vercel Hobby, with Valhalla inside the API, when it must stay up
> while the Mac is off. Oracle is now a fallback, under "If Vercel is a no-go".
> Research: 5 agents + 1 reviewer checked official pricing pages on 2026-10-31 (summary under "Evidence";
> Phase B has its own Evidence, checked 2026-11-09).

## Objective
Let the author's friends open the planner from their own phones, over HTTPS (needed for GPS),
at a stable URL, for **$0**, with no account that can bill without the author choosing it.
Success: a friend on mobile data opens the URL, searches a hotel, and gets bus, drive and walk results.
Navigation (pilot) works on their iPhone.

Not a commercial product: no ads, payments or affiliate links. Several free terms depend on this
(Vercel Hobby, Open-Meteo, Tailscale Personal).

## Architecture

```
friend's phone ──HTTPS──▶ Tailscale Funnel (https://hakuba-map.<tailnet>.ts.net, TLS by Tailscale)
                              │ only port 443 → localhost:3000
                              ▼
                     Next.js production server (next start, :3000)
                              │ rewrite /api/* (same origin, no CORS)
                              ▼
                     FastAPI (uvicorn, 127.0.0.1:8011) ──▶ Photon, Open-Meteo, maps.app.goo.gl (HEAD)
                              │
                              ▼
                     Valhalla (docker, 127.0.0.1:8002), Hakuba-only tiles (5.7 MB, ~65 MB RAM)
```
Map tiles come straight from OpenFreeMap to the browser, so they never touch our server.

### Phase A: this Mac
- **Production build, not the dev server.** `next build && next start`. The dev server is slow,
  shows the dev overlay, and turns on the dev-only `?simulate` path.
- **One public port.** Funnel publishes only `:3000`. The API binds `127.0.0.1:8011`. Valhalla's
  docker port is bound to `127.0.0.1:8002` (`infra/docker-compose.yml`).
- **The machine name is in the URL.** Rename the Mac in Tailscale to `hakuba-map` before turning Funnel
  on, so the URL doesn't include the owner's name.
- **Kill switch:** `tailscale funnel --https=443 off` takes the site offline at once, with nothing
  else to undo. Taking the site down is the rollback.
- **Uptime is the Mac's uptime.** The site is down while the Mac sleeps, reboots, or is offline. The author
  changes the energy settings (Claude doesn't change system settings).
- A script, `scripts/serve-public.sh`, starts the three services on their own ports (API :8011,
  web :3000, so the dev servers keep running beside them), checks `/api/health` *through the web
  rewrite*, and only then, with `--funnel`, turns Funnel on. `--stop` turns Funnel off first.

### Phase B: Vercel Hobby (v1.6, after Phase A is live)
Decision and alternatives: [ADR-0006](docs/adr/0006-vercel-phase-b.md).

#### Objective
Keep the planner up while the owner's MacBook is closed, for **$0**, for the owner and friends
(ADR-0005: friends only this season). Success is the Phase A test with the Mac out of the path: a
friend on mobile data opens the URL, searches a hotel, gets bus, drive and walk results, and
navigation works on their iPhone.

#### Assumptions (correct these before building)
1. Friends move to one new link. A Funnel link can't outlive the Mac.
2. A cold first route may take up to 5 s. Warm requests stay under 500 ms.
3. Non-commercial stays true: no ads, payments or affiliate links (Vercel Hobby requires it).
4. A beta Vercel feature (Services) is acceptable for a friends-only app.
5. Up to 1,000 app sessions a month (about 10 people, 3 sessions a day). Used only for the usage check.

#### Architecture
```
friend's phone ──HTTPS──▶ Vercel (https://<project>.vercel.app, region hnd1)
                            ├─ /api/* ─▶ service "api": FastAPI as one Python Function
                            │              └─ pyvalhalla Actor, in process, Hakuba tiles (read-only)
                            └─ /*     ─▶ service "web": Next.js
```
Map tiles still go straight from OpenFreeMap to the browser. Photon, Open-Meteo and Google short
links are still called only from the API. Valhalla is no longer a network service in production.

```jsonc
// vercel.json. Shape from the Services docs, with the project's Root Directory at the repo root.
// `services` needs no manual Framework Preset change: S0 ran this shape on a minimal app with the
// preset left at FastAPI. Checkpoint S confirms it on the real app.
{
  "regions": ["hnd1"],
  "git": { "deploymentEnabled": false },   // deploys are explicit: see scripts/deploy-vercel.sh
  "services": {
    "web": { "root": "apps/web/" },
    "api": {
      "root": "services/api/",
      "entrypoint": "src.hakuba_api.main:app",
      "headers": [{ "source": "/(.*)",
                    "headers": [{ "key": "X-Content-Type-Options", "value": "nosniff" }] }]
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": { "service": "api" } },
    { "source": "/(.*)", "destination": { "service": "web" } }
  ]
}
```

#### Tech stack
Next.js 16.4 (pnpm 12, pinned), FastAPI on Python 3.12 (uv), `pyvalhalla==3.9.1` (MIT, same version
as the Valhalla image in `infra/docker-compose.yml`), Vercel Hobby with Services (beta), Fluid compute.

#### Stages
**Start:** now, as a recorded exception to the takeover order (owner, 2026-11-09; ADR-0006). Phase A
on the Mac keeps serving until cutover.

1. **Probe P, before any repo change.** A throwaway project outside the repo: one FastAPI file,
   `pyvalhalla`, `valhalla_tiles.tar`, one route. Every big unknown is on Vercel, and this costs little.
   Passed 2026-11-09, as did probe S0, which ran the `services` config on a minimal Next.js app and
   FastAPI package. Results under Evidence.
2. **Repo changes** below, each a small PR.
3. **Checkpoint S** on a protected preview deployment.
4. **Cutover**, only after the owner's OK.

#### Changes to the repo
1. **In-process routing behind the existing seam.** `ValhallaClient._post` picks its backend:
   `VALHALLA_TILES` set → in process; otherwise HTTP to `VALHALLA_URL`. **The HTTP backend stays
   permanently**, because the Mac is the standby. `/route` → `actor.route`,
   `/sources_to_targets` → `actor.matrix`.
2. **Actor config is exactly** `get_config(tile_extract=<tar>, tile_dir="", verbose=False)`. It needs
   only the tar and turns logging off.
3. **One engine per process, built under a module-level lock.** `get_valhalla()` builds a new client
   per request today (`routing/router.py:17`), and `functools.cache` may run its function twice when
   threads race, so it can't be relied on here.
4. **Every Actor call holds one lock.** A shared Actor crashes the process under threads (Evidence),
   and FastAPI runs our sync endpoints on a thread pool. Waiting for the lock is bounded to 10 s, then
   `RoutingUnavailableError`. The C++ call itself can't be interrupted, so request size must be bounded.
5. **Bound `/api/matrix`.** `MatrixRequest.targets` is unbounded today (`routing/router.py:69`), and
   the web app doesn't call this endpoint. Add `max_length=25`, matching `/route/path`.
6. **Errors keep their meaning.** `ValhallaError` with `http_code == 400` → `NoRouteError`. Any other
   exception from the binding, or from building the Actor → `RoutingUnavailableError`.
7. **`data/paths.py`:** resolve the repo root lazily. `parents[5]` runs at import and raises
   `IndexError` on a shallow deployment path, even when `HAKUBA_DATA_DIR` is set.
8. **`scripts/deploy-vercel.sh [--prod]`** is the only way to deploy:
   - `git archive HEAD` into a temp folder, so only committed files are uploaded. `.ux-evidence`,
     `infra/valhalla/custom_files`, `.run` and `.env` can't leave the machine.
   - Copy the local `valhalla_tiles.tar` in after checking it against
     `infra/valhalla/hakuba-tiles.sha256`, which this work commits (it doesn't exist yet). A missing file or wrong hash stops the deploy.
   - Copy the runtime data next to the API and fail if any is missing: `resorts.json`,
     `bus_stops.json`, `bus/timetables/**`, `bus/sources.json`, `lodging_osm.json`,
     `lodging_overture.json`, `poi_osm.json`, `crowd_periods.json`. `data/bus/raw` and
     `stop_evidence.json` aren't needed at runtime and stay out.
   - Print the commit it deploys, then run `vercel deploy --environment preview`, or
     `vercel deploy --prod` only when asked. Without the flag, a new project's first deploy goes to
     production, as it did at Probe P.
   - **The real project's first deploy is unverified.** S0 reused a project that already had
     deployments, so nothing yet shows the server honours the flag on a first deploy. Tell the owner
     before that deploy, and read `environment` in its output straight after.
9. **Environment:** `PUBLIC_URL`, `TRUSTED_PROXY_HOPS=1` (Vercel overwrites `X-Forwarded-For` with
   the client address), `VALHALLA_TILES`, `HAKUBA_DATA_DIR`. Set for Preview and Production.
10. **Production smoke suite**, `apps/web/e2e-prod/` with its own Playwright config: no local servers,
    `PROD_URL` and a protection-bypass header from the environment, about 5 tests (headers, search,
    bus, drive, walk). The existing suite assumes `127.0.0.1:8010` and dev-only hooks, and about 199
    tests from one IP would hit the per-client limit.
11. **Phone map credits, before cutover.** Done in PR #38 (`tasks/todo.md` J10): phones are this
    spec's audience, and the credits now clear the collapsed sheet. J10 lists the known limits.

#### Code style
```python
class InProcessEngine:
    """One Actor, one call at a time: the binding drops the GIL, and concurrent calls crash."""

    def post(self, path: str, body: dict[str, Any]) -> Any:
        if not self._lock.acquire(timeout=self._wait_s):
            raise RoutingUnavailableError("routing busy")
        try:
            return self._call[path](body)
        except ValhallaError as e:
            if e.http_code == 400:
                raise NoRouteError(e.message) from e
            raise RoutingUnavailableError(str(e)) from e
        except Exception as e:  # the binding can raise other C++ errors
            raise RoutingUnavailableError(str(e)) from e
        finally:
            self._lock.release()
```

#### Accepted limits and runbook
- **In-memory state is per instance.** `Limits` and the snow, Photon and POI caches reset on a new
  instance. Upstream budgets and the per-client limit become best effort, for friends only. A public
  launch must move them to shared storage first. Open-Meteo's daily limit applies to a shared IP.
- **Quota lock-out.** Over a Hobby allotment, Functions stop and visitors get an error until the
  30-day window passes, with no bill. It covers both services, so the whole site. Before each trip,
  run `vercel billing usage`. Standby: on the Mac, `scripts/serve-public.sh --funnel`, then send
  friends that link. **If this happens during a trip with the Mac off at home, the site stays down.**
  The owner accepts that, or brings the Mac and a stable network.
- **Saved data doesn't move by itself.** `localStorage` is per origin. Saved lists move with the
  existing Share list link (`#import=`, SPEC-saved-places). Rider settings and recent searches start
  empty unless the build finds an existing link for them. Falling back to Funnel returns to the old
  origin's data.
- **Rollback reaches only the previous deployment**, and it stops domains auto-assigning until
  `vercel promote <deployment>` is run. Every later fix needs that step.

#### Commands
```bash
uv run pytest                                  # services/api; the fake-Actor tests run in CI
uv run pytest -m live                          # needs local tiles and Valhalla
scripts/deploy-vercel.sh                       # protected preview
scripts/deploy-vercel.sh --prod                # ask first
PROD_URL=https://<url> pnpm exec playwright test -c e2e-prod/playwright.config.ts   # apps/web
vercel billing usage --since 30d --group-by project
```

#### Testing
| What | How |
|---|---|
| Calls are serialized | unit, CI: a fake Actor records overlap; 8 threads → max overlap 1 |
| One engine | unit, CI: concurrent first calls build exactly one engine |
| Lock timeout and error mapping | unit, CI: fake Actor blocks or raises; assert the two error types |
| Matrix bound | unit, CI: 26 targets → 422 |
| Same answers as the server | `live`: a seeded request generator in the repo, 100 mixed + 20 `/route/path` (through points and `stop_at_points`) + 5 error cases, using the tar-only config |
| Real threads | `live`: real Actor, 40 threads, 2000 requests, 0 wrong, no crash |
| Deploy script | shell test: a missing data file or wrong hash stops it; without `--prod` the command carries `--environment preview` |

#### Probe P and Checkpoint S
A **config mistake** (a path, a preset, a missing variable) is fixed and retried. A **platform no-go**
is marked below; it stops the work and returns to the owner. Use a protection-bypass header or
`vercel curl` for previews. A temporary `x-boot-id` response header on the preview tells instances apart.

| Stage | Check | Pass | No-go? |
|---|---|---|---|
| P | Wheel and tiles load on Vercel | one route returns, parsed `Route` equals the Mac's within 1 s and 10 m | **yes** |
| P | Cold start | new `x-boot-id` on the first `/api/route` after 10 idle minutes: median of 5 ≤ 5 s | **yes** |
| P | Region | function segment of `x-vercel-id` on an `/api` response is `hnd1` | **yes** |
| S | Services serve one origin | `/` and `/api/health` 200 | **yes** |
| S | Entrypoint and `src/` layout | API starts with `src.hakuba_api.main:app` (passed at S0 on a minimal package), or a documented adapter file makes it start | no |
| S | Data reached the Function | resort list, a bus query, lodging count equal to local | no |
| S | Real API cold start | full API and data, new `x-boot-id` on the first `/api/route` after 10 idle minutes: median of 5 ≤ 5 s | no; if over, report to the owner and leave the limit as it is |
| S | Warm latency | median of 20 ≤ 500 ms from the owner's phone network | no |
| S | Concurrency | 40 parallel routes: 0 failures, one `x-boot-id` per instance throughout | **yes** |
| S | Client IP | with a forged `X-Forwarded-For`, on one `x-boot-id`, the limiter counts the real client | no |
| S | Upstreams from Vercel | Photon, Open-Meteo and a Google short link answer | no |
| S | Abuse bound | a Vercel firewall rate rule on `/api/*` exists, if Hobby allows it; otherwise record that | no |
| S | Kill switch | tried once: deployment protection on all deployments makes the site unreachable, or another named method | no |
| S | Mac standby rehearsed | after the code change, `serve-public.sh` serves routes over HTTP | no |

#### Success criteria
1. Probe P and Checkpoint S pass.
2. With the Mac's lid closed, the live check in Objective passes from a phone on mobile data.
3. `uv run pytest`, CI (`api`, `web`) and the production smoke suite are green.
4. After 30 scripted sessions, usage per session × 1,000 sessions stays under 50% of every Hobby allotment.
5. Funnel is turned off only after 1 to 4 hold, and `SPEC-deploy.md`, `docs/ARCHITECTURE.md` and the
   project `CLAUDE.md` describe the new setup.

#### Boundaries
- **Always:** deploy only through the script; hold the lock around every Actor call; keep the HTTP
  backend; verify the tile hash; keep the map and data credits visible.
- **Ask first:** creating the Vercel account or linking the project (the owner does this); the real
  project's first deploy; production deploys; adding the `pyvalhalla` dependency; turning Funnel off; sending friends the new link.
- **Never:** upgrade to Pro or add a card; call one Actor from two threads without the lock; commit
  or publish tiles; make the app commercial on Hobby; serve the dev server publicly.

#### If Vercel is a no-go
Stay on Phase A (the Mac) and reopen the choice with the owner. The candidates are the Oracle section
kept below, then AWS Lightsail at $7 a month, which needs the owner's OK to break the $0 rule.

**Oracle Always Free VM (the v1.5 plan, not built):**
- One Ampere A1 VM in the home region (Tokyo or Osaka if capacity allows), run with Docker Compose:
  `web` (Next standalone), `api`, `valhalla` (tiles built in). HTTPS through Tailscale Funnel on the
  VM, so no inbound ports are open, or Caddy + Let's Encrypt on a free DuckDNS name.
- **Size the VM to the stack (1 OCPU / 2–3 GB).** Oracle reclaims a VM whose CPU, network *and* memory
  all stay under 20% for 7 days. The stack uses ~0.5 GB, so a small VM keeps memory above 20%. It also
  stays far under the 2 OCPU / 12 GB free limit, so the trial-end rule (A1 over the limit → disabled)
  can't apply.
- Never upgrade to Pay As You Go. A free-tier account is never upgraded automatically.
- To be detailed in v1.5.1 once Phase A has run for a while (image build path depends on repo visibility; see [ADR-0005](docs/adr/0005-repo-visibility.md)).

#### Evidence (checked 2026-11-09)
| Claim | Source |
|---|---|
| Tar-only config matches the server: 120 of 120 identical, 5 of 5 error codes equal, all `http_code` 400 | Local run 2026-11-09, macOS arm64, Hakuba tiles |
| Cold cost: import 107 ms, Actor 6.5 ms, first route 95 ms (medians of 10; first run 0.9 s) | Local run, machine load 9–18 on 8 cores |
| Memory about 106 MB after 100 requests; installed package 81 MB on macOS | Local run |
| Shared Actor: 4 of 4 runs with 8 or 40 threads crashed; with a lock 0 wrong of 2000 | Local run |
| A 1,900-target matrix took 23 CPU-seconds and 949 MB | Fresh-eyes reviewer's run, same setup |
| Binding releases the GIL per call | `src/bindings/python/src/actor.cc`, github.com/valhalla/valhalla |
| Linux x86_64 and aarch64 wheels exist, Python 3.12+ | pypi.org/project/pyvalhalla |
| Services: beta, all plans, internal unless rewritten; `/api/x` arrives as `/api/x` | vercel.com/docs/services, /services/routing |
| Python 500 MB bundle, Hobby 2 GB / 300 s, 30-day lock, 4 CPU-hrs, 360 GB-hrs | vercel.com/docs/functions/limitations, /plans/hobby |
| `X-Forwarded-For` overwritten by Vercel | vercel.com/docs/headers/request-headers |
| Rollback: previous deployment only; undo with `vercel promote` | vercel.com/docs/instant-rollback |
| Probe P: route equals the Mac's (0 s, 0 m); function in `hnd1`; cold start median of 5 is 3.62 s (3.52 to 3.93) | Vercel preview, 2026-11-09 |
| Almost all of that cold start is outside our code: import 66 ms, Actor 20 ms (medians of 5). The real API loads more data and has 1.4 s of room | Same run |
| The Linux bundle is 272 MB, not the 81 MB measured on macOS; the limit is 500 MB | Probe P build |
| A new project's first `vercel deploy` went to production | Probe P; removed with the owner's OK |
| S0: `/` and `/api/health` 200; `/api` in `hnd1` with top-level `regions`; service-level headers applied; preset left at FastAPI | Vercel preview, 2026-11-09 |
| `hakuba_api.main:app` fails to deploy ("has entrypoint \"hakuba_api/main.py\" but that path does not exist"); `src.hakuba_api.main:app` deploys, and `from hakuba_api...` imports inside the package work | S0 deploy output |

Not verified: the real app on Vercel (S0 was a minimal app) and files outside a service root, both
covered by rows above; where the `web` service runs (S0 measured only `/api`); and whether a real
project's first deploy honours `--environment preview` (Changes item 8).

#### Open questions
1. The `*.vercel.app` name is first-come. The owner picks it when linking the project.

## Changes to the repo (both phases)
1. **Hakuba-only Valhalla tiles, reproducible.** `infra/valhalla/build-hakuba.sh`: download Geofabrik
   chubu → `osmium extract` to the box in `infra/valhalla/hakuba.bbox` (`--strategy smart`) → `valhalla_build_admins`
   + `valhalla_build_tiles` with `default_speeds.json` → `tiles.tar`. Without the speeds file, drive
   times came out up to 37% too fast. The bbox covers every resort, bus stop and lodging in `data/`;
   a test checks this with a 5 km margin (the first box, 137.70,36.45,138.00,36.90, left Otari lodgings 1 km from its edge).
2. **Rate limits on the API (no new dependency).**
   - A **global** budget per upstream protects the third parties. Photon ≤ 1 req/s, Open-Meteo ≤ 1 req/s
     (with the existing 24 h / 1 h caches, real traffic stays well below), and Google short links ≤ 1 per 2 s.
     Over budget → 503 `upstream_busy`, which the UI already shows as unavailable.
   - A **per-client** budget: 120 requests/min across the API (`/api/health` exempt). Over → 429 with
     `Retry-After`. The client is the address our trusted proxy *appended* to `X-Forwarded-For`
     (`TRUSTED_PROXY_HOPS=1` behind Funnel). Earlier hops come from the client and may be forged.
     **Measured 2026-10-31:** Next's rewrite passes `X-Forwarded-For` through but never adds one, so the
     API's socket peer is always Next (127.0.0.1). So `TRUSTED_PROXY_HOPS` unset (local dev) turns
     per-client limits off, and a missing hop means "unknown": then only the upstream budgets apply,
     never one bucket shared by everyone. Whether Funnel appends the hop is checked at Checkpoint M.
3. **Identify ourselves upstream.** `USER_AGENT` includes the public URL and drops "local dev"
   (env `PUBLIC_URL`).
4. **Security headers.** Next `headers()`: `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self)`,
   `X-Frame-Options: DENY`. A full CSP is out of scope for v1.5: MapLibre workers need careful tuning.
5. **Not in search engines.** `robots.txt` disallows all, plus a `noindex` meta tag. Friends get the link
   directly. Being indexed would spend the upstream fair-use budgets on strangers.
6. **Ports.** `infra/docker-compose.yml` binds `127.0.0.1:8002:8002`.

## Commands
```bash
infra/valhalla/build-hakuba.sh            # → infra/valhalla/custom_files/hakuba/tiles.tar (gitignored)
scripts/serve-public.sh                   # valhalla + api (:8011) + production web (:3000), health check
scripts/serve-public.sh --funnel          # ... then publish :3000 on https://<machine>.<tailnet>.ts.net (ask first)
scripts/serve-public.sh --stop            # Funnel off first, then stop api + web (dev servers keep running)
tailscale funnel status                   # what is public right now
```

### When the public link fails (Phase A runbook)
Seen 2026-11-02: after the Mac changed networks (it had been on the phone's hotspot, which left
with the phone), phones got `ERR_SSL_PROTOCOL_ERROR`: the Funnel relay accepted the connection but
could not hand it to the Mac. `tailscale status` looked healthy; re-applying `tailscale funnel` did
not help. A full reconnect did:
```bash
tailscale down && tailscale up --hostname=hakuba-map   # rebuilds every path; the Funnel config persists
```
- Test from a device **outside** the tailnet (a phone on mobile data, or an external fetch). From the
  Mac itself the public URL takes the tailnet shortcut, and its relay test fails even when Funnel works.
- An external fetch can succeed through another region's relay while phones in Asia fail: test from
  where the users are.
- While the Mac serves the site, keep it on a network that does not move (home Wi-Fi or a cable),
  never on the phone's hotspot.

## Testing
| What | How |
|---|---|
| Hakuba tiles give the same answers | `pytest -m live`: 4 fixed origin → resort pairs, drive and walk, equal to the Chubu build. Measured 2026-10-31: identical. |
| bbox covers all data | unit test: every coordinate in `data/*.json` is inside the bbox with ≥ 5 km margin |
| Rate limits | unit tests: token bucket refill and limits; 429 per client; 503 when the global budget is spent; cache hits don't spend budget |
| Headers, robots | e2e against `next start`: headers are present, and `/robots.txt` disallows all |
| Production build | the full e2e suite runs against `next start` (not dev) before going public |
| Live check | from a phone on mobile data (Wi-Fi off): search → bus/drive/walk → Start navigation |

## Boundaries
- **Always:** only the web port is public; check `/api/health` before turning Funnel on; keep the
  credits (OSM, OpenFreeMap, Open-Meteo, Hakuba Valley, Overture) visible.
- **Ask first:** turning Funnel on (each time it goes public after a change to what it exposes);
  creating the Oracle account or VM; changing the GitHub repo's visibility; adding any hosting service not listed here.
- **Never:** upgrade any account to paid; add a card to Render/Vercel; open inbound ports on the home router;
  serve the API anywhere but `/api` on the site's origin, or expose Valhalla as a network service
  (Phase A binds it to `127.0.0.1`; Phase B has no such service); serve the dev server publicly.

## Evidence (checked 2026-10-31)
| Claim | Source |
|---|---|
| Funnel: free on all plans, beta, bandwidth limits not configurable and not published, URL on `*.ts.net` | tailscale.com/kb/1223/funnel |
| Oracle A1 free = 2 OCPU / 12 GB (halved ~June 2026); idle reclamation rule; free tier never auto-upgraded | docs.oracle.com … Always_Free_Resources.htm, oracle.com/cloud/free/faq |
| GCP e2-micro pays for its IPv4 address (~$3.6/month), so it isn't free | cloud.google.com/vpc/network-pricing |
| Open-Meteo free = non-commercial, < 10k calls/day, credit required | open-meteo.com/en/terms |
| Photon public: "reasonable" use, heavy use throttled, no numbers | photon.komoot.io, github.com/komoot/photon |
| OpenFreeMap: no request limits, attribution in the style | openfreemap.org FAQ |

## Open questions
1. **GitHub repo visibility.** See [ADR-0005](docs/adr/0005-repo-visibility.md): friends only this
   season, and the repo stays public for now.
2. **Branch name.** Local is `master`, but `ci.yml` triggers on `main`, so CI would never run. Rename to `main` before the first push.
