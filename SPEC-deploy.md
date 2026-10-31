# Spec: deploy

> Module of [SPEC.md](SPEC.md). Depends on: every server module (it hosts them). Consumed by: friends' browsers.
> Added 2026-10-31 (v1.5). Decisions: zero cost; **Phase A** = this Mac + Tailscale Funnel now,
> **Phase B** = one Oracle Cloud Always Free VM when it must stay up while the Mac is off.
> Research: 5 agents + 1 reviewer checked official pricing pages on 2026-10-31 (summary under "Evidence").

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
                     FastAPI (uvicorn, 127.0.0.1:8010) ──▶ Photon, Open-Meteo, maps.app.goo.gl (HEAD)
                              │
                              ▼
                     Valhalla (docker, 127.0.0.1:8002), Hakuba-only tiles (5.7 MB, ~65 MB RAM)
```
Map tiles come straight from OpenFreeMap to the browser, so they never touch our server.

### Phase A: this Mac
- **Production build, not the dev server.** `next build && next start`. The dev server is slow,
  shows the dev overlay, and turns on the dev-only `?simulate` path.
- **One public port.** Funnel publishes only `:3000`. The API binds `127.0.0.1:8010`. Valhalla's
  docker port is bound to `127.0.0.1:8002`; today it listens on every interface, so the LAN can reach it.
- **The machine name is in the URL.** Rename the Mac in Tailscale to `hakuba-map` before turning Funnel
  on, so the URL doesn't include the owner's name.
- **Kill switch:** `tailscale funnel --https=443 off` takes the site offline at once, with nothing
  else to undo. Taking the site down is the rollback.
- **Uptime is the Mac's uptime.** The site is down while the Mac sleeps, reboots, or is offline. The author
  changes the energy settings (Claude doesn't change system settings).
- A script, `scripts/serve-public.sh`, builds, starts the three services, checks `/api/health`, then
  turns Funnel on. `--stop` reverses it.

### Phase B: Oracle Always Free VM (after Phase A is live)
- One Ampere A1 VM in the home region (Tokyo or Osaka if capacity allows), run with Docker Compose:
  `web` (Next standalone), `api`, `valhalla` (tiles built in). HTTPS through Tailscale Funnel on the
  VM, so no inbound ports are open, or Caddy + Let's Encrypt on a free DuckDNS name.
- **Size the VM to the stack (1 OCPU / 2–3 GB).** Oracle reclaims a VM whose CPU, network *and* memory
  all stay under 20% for 7 days. The stack uses ~0.5 GB, so a small VM keeps memory above 20%. It also
  stays far under the 2 OCPU / 12 GB free limit, so the trial-end rule (A1 over the limit → disabled)
  can't apply.
- Never upgrade to Pay As You Go. A free-tier account is never upgraded automatically.
- To be detailed in v1.5.1 once Phase A has run for a while (image build path depends on repo visibility; see Open questions).

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
scripts/serve-public.sh                   # build web, start valhalla + api + web, health check, funnel on
scripts/serve-public.sh --stop            # funnel off, stop api + web
tailscale funnel status                   # what is public right now
```

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
  creating the Oracle account or VM; making the GitHub repo public; adding any hosting service not listed here.
- **Never:** upgrade any account to paid; add a card to Render/Vercel; open inbound ports on the home router;
  expose the API or Valhalla ports directly; serve the dev server publicly.

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
1. **GitHub repo visibility.** Private (recommended now): code and data stay private. 2,000 free Actions
   minutes/month is plenty for `ci.yml`. Phase B would build images on the VM, because pulling private
   GHCR images has a 1 GB/month free transfer limit. Public: unlimited Actions minutes and free public
   images, but the commit email becomes public (rewrite history to the GitHub noreply address first),
   and scheduled workflows stop after 60 days without activity.
   *(The 2,000-minute, 1 GB and 60-day figures are from memory and weren't verified on 2026-10-31.
   Check them on GitHub's billing docs before relying on them.)*
2. **Branch name.** Local is `master`, but `ci.yml` triggers on `main`, so CI would never run. Rename to `main` before the first push.
