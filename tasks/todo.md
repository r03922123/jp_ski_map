# Tasks: Hakuba Ski Map

Open work only. Finished tasks leave this file when they land: the git log and the PRs record them. The
list as it stood before the trim (Tasks 1–88, J10–J18 with every finished item) is
`git show 83eb133:tasks/todo.md`.

Plan: [plan.md](plan.md). Every task also has to meet the Definition of Done: quality gates from SPEC.md green,
no regressions, behavior checked at runtime, specs updated if a decision changed. The check commands are in
`CLAUDE.md`.

## Checkpoint K: Pilot (the user's phone walk)
- [ ] User walks a short real route on their phone via `pnpm dev:https`

## Checkpoint O: v1.6 done
- [ ] Phone check over the dev HTTPS server: needs the author's iPhone (title, HUD, check-in at a base, stamp moment, sound toggle)

## Task 80: On touch, a tap looks and a long-press drops a pin (cluster A, SPEC-web-app v1.7)
**Open:** a Safari check; the laptop rule waits for the desktop reference (L1: a click that closes a popover also moves the start). **Scope:** M

## Task 85: Real device, review, commit
- [ ] Real iPhone Safari: v1.8 To box and the v1.7 long-press (needs a phone turn via the lock)

## Task 87: Map first on phones (SPEC-web-app v1.9: T-fold + cluster F)
- [ ] Real-device check: the iPhone is unplugged. Plan: iOS Simulator (Xcode 27 needs macOS 26.6; this Mac is 26.5), or the public link once the iPhone is back
- Open: the start appears twice on laptops/tablets (top From box and the trip panel's From row); candidate follow-up

## Task 88: Intermittent: the To box reads empty after "Clear starting point" (open)
Seen 2026-11-04 only under load (15–22): `setting-the-start.spec.ts` "clear the start (trip ✕ and box ✕) … the destination stays" failed 6/16 in one repeat run, with the To box at `""` while the destination (resort) still exists. Then 16/16 in Playwright and 8/8 in a step-by-step reproduction logging the box after every step passed. Reasoning ruled out the destination vanishing (the resort and its fallback access point don't depend on the start). Next: `trace: "retain-on-failure"` is now on, so read the first failing trace before changing code.

## Task 89: Google rating card goes live (SPEC-poi-destinations v1.2)
The code is merged and hidden until a key exists. Owner only:
- [ ] Owner setup from the spec: Google Cloud project, billing, two restricted keys, daily quota caps; browser key in
  Vercel and `apps/web/.env.local`
- [x] `GOOGLE_PLACES_SERVER_KEY=… uv run --directory services/api --frozen python -m hakuba_api.pois.refresh_google_ids`,
  commit `data/poi_google.json` and `.meta.json` (2026-11-25: 57 of 77 matched; 2 sharing one place dropped)
- [ ] Open the first 10 food results (walk) from JR Hakuba Station; fewer than 9 right → tighten the match

## Task J10: Overture licence label (ADR-0004 next step 2)
- Known limits: with the sheet expanded the credits stay covered until it collapses. With no trip they open over the map's labels and a resort marker until the first drag or a tap on ⓘ. On landscape phones about 320 px tall or less, the ⓘ takes a tap on `+`, which worked before this change; pinch zoom still works. At those sizes, credits reopened during a trip sit partly under the trip card. The zoom buttons stay behind the sheet on portrait phones, as before. Not checked: navigation mode, where a bottom bar replaces the sheet, and real iPhones or WebKit.
- Follow-up 1 stays open for the 15 My Maps stops, follow-up 2 for the December re-check; the takeover phase is unchanged.

## Task J13: Phone map, first load (owner, 2026-11-11, from a production screenshot)
- Known limits: with no start the sheet's hint ("Type a place above, or long-press the map") no longer shows on phones; the search box placeholder is the only cue. Not checked on a real iPhone or WebKit

## Vercel Phase B (SPEC-deploy.md v1.6, ADR-0006)
- [ ] Cutover: production deploy and smoke (owner pre-approved 2026-11-10), new link to friends (the owner sends it), Funnel off (the owner, after friends move their saved lists). Done when SPEC-deploy.md Phase B success criteria 1 to 5 hold; 2 (phone on mobile data, Mac lid closed) is the owner's check
  - 2026-11-13: the owner asked to run on Vercel only. Funnel off, the standby API and web stopped, the Valhalla container stopped. Still the owner's: criterion 2 on a phone, and telling friends who still use the old link

## Task J14: MCP tools in Claude chat (SPEC-agent-tools v2)
- [ ] Owner: add the link from `~/.config/jp_ski_map/mcp-connector-url.txt` as a custom connector on claude.ai, ask a trip question from the phone app, then send the link to friends

## Task J15: Production habits around the ML parts (2026-11-16)
- Found by #72's eval, open: for the same trip `rank_resorts` gives `driveMin` 6.6 and `route` gives 7.7 min (matrix vs route cost); an agent that answers from either is "right". Drive is gone since 2026-11-25; recheck the same gap for `walkMin`
- Found by #68's first run, open: `/api/places/suggest?q=tokyu` took 1255 ms, 1231 ms of it waiting on Photon, whose timeout is 10 s. Search-as-you-type needs a short timeout on that fallback

## Task J16: MLflow eval loop and Langfuse production traces (SPEC-agent-tools v3, 2026-11-16)
- [ ] Eval v4 follow-ups: still near the ceiling, so it shows a regression, not an improvement (needs harder questions or a weaker model); re-pin bus times when the 2026-27 timetable is published; crowd heuristic ranks Jigatake quietest on every date (its prior is 0 and every date term applies to all resorts alike, so only snow changes the crowd ranking)

## Rebuild from the URL, and Ask Maps (2026-11-18; status at main 8485c47)
Specs: [SPEC-pipeline.md](../SPEC-pipeline.md) (P1–P7), [SPEC-ask-maps.md](../SPEC-ask-maps.md) (A0–A4),
[ADR-0007](../docs/adr/0007-automated-verification-and-capped-llm.md) (Accepted: paid steps within the ~$100
credit and a $5/month cap), [review](../docs/review/2026-11-18-codebase-review.md). Each task is one PR,
built in a fresh session from its spec.
- Decision (owner, 2026-11-18): the first version is $0. Build only the $0 tasks (P2, A3, P5's
  parsers, P6, P7, and P3/P4 with the local extractor B only); every paid call (P3's hosted
  comparison, P4's re-read with A, A2, A4) waits for a second version. ADR-0007's cap stays the bound then.
- [ ] Owner, before the second version's first paid call: Console workspace spend limit $5/month,
  auto-reload off, `ANTHROPIC_API_KEY` in Vercel env and Actions secrets.
- [ ] A1 leftover: SSE spike on a preview (folds into A4)
- Open from P1: the private snapshot repo, so `--offline` works only on the machine that crawled
- [ ] P2, split into slices (the spec's P2 is ~4 PRs of work):
  - [ ] P2b `lines`, P2c `osm` pinned + cropped PBF → Valhalla, P2d `stops` without `MANUAL_MATCHES`
- [ ] Next, $0: P2b, then A3 (web AskSheet with a stubbed `/ask`; the refactor's W3 it waited for merged in PR #89). Then the other $0 tasks in spec order.
- Open, seen in P2a: `locate_stops` still geocodes with GSI and writes `gsi:…`, which ADR-0004 bans
  for stops and `KNOWN_SOURCES` doesn't list; P2d drops GSI.

## Phone screen split, Google Maps iOS benchmark (2026-11-20, PRs #93, #96–#100)
Spec: [SPEC-maps-ios-ux.md](../SPEC-maps-ios-ux.md); measured from the owner's two iPhone recordings (BC-L1 update).
- [ ] Owner: try both on the real iPhone (Safari tab and home-screen app); our numbers so far are Chromium emulation (v1.19: insets simulated; check the clock is readable and nothing sits under the notch or home bar)
- Open: the camera doesn't refit when the sheet goes low (the route stays where the 40% fit put it)

## Google Maps route preview, second pass (2026-11-20, PRs #108–#110)
From the owner's two screenshots (ours and Google Maps iPhone route preview): Google's map 422 pt (50%), ours 321 pt (38%), plus a 47 pt band at the bottom and a blurred strip behind the clock.
- [ ] Owner, on the iPhone: reopen the home-screen app (re-add the icon if the old look stays); expect no band and a light bar. With USB connected, open /viewport-check from the icon so the agent can read safe top 0 and gap 0, then delete the gap code
- Open: removing the last stop can leave keyboard focus on Add destination below the sheet's fold (review of #109, minor)
- Local e2e on main: ~40 journey/sheet tests fail with and without these PRs (place-card trip-card tests, flaky camera-fit tests in route-clear-of-panels and route-option-visible, map-credits first display); resilience "switch to Walk" became timing-dependent with #106 and now uses Bus

## Google Maps layout on the laptop, and real-iPhone numbers (2026-11-20, PRs #105, #106)
- Open: Google Maps iOS can't be driven from a Claude Code session (no computer-use tools here, no Xcode); the low
  sheet and the start-set state still need a real-finger check on the iPhone. Bus tab time; the expand tab centres
  on the card, not the window (review nit)
- Local e2e: 15 tests fail on main and with these PRs alike (dev "1 Insight" badge, first-display credits, small-phone walk)

## Landscape route bar (2026-11-19, PR #91)
- Still failing locally, also on main: the dev-only Next "1 Insight" badge covers the bottom-left (small-phone walk ×2, bus "Start in view" ×2, map-credits 360×740); "Start from Walk"; the off-season `test.fail` passes unexpectedly. Hiding the badge makes the small-phone tests pass.

## The Maps look, deletion first (SPEC-web-app v1.30, 2026-11-23)
From the 2026-11-23 UX review: Google Maps stays the interaction model; game pieces go or are restyled.
Basemap and route colours land before the ski-runs layer (SPEC-ski-runs), so run colours are tuned once.
- [ ] Next batch (needs its own spec lines): stamps restyled as "Visited ✓" (keep the stamp data); remove the
  hero sprite, the destination flag, world badges and other sprites; lucide icons in their place; a new app icon

## Task J17: Ski runs and lifts on the map (SPEC-ski-runs, owner's first pick 2026-11-23)
Build [SPEC-ski-runs.md](../SPEC-ski-runs.md): refresh module and snapshot, validator, `GET /api/ski-lines`, the map
layer and the credit. Acceptance criteria are in the spec. **Scope:** M (API slice, then web slice: two PRs)
- [ ] Freeride and extreme runs draw solid orange, not dashed (none in the 2026-11-23 snapshot)
- [x] v1.1 (owner's request, 2026-11-23): a tap on a run or lift opens its card (name, difficulty or lift type,
  resort), and the dropped pin is Google's red pin with a bottom card (`MapCard`), replacing the popup and its
  placement maths (`pinCardAnchor`, `pinEaseOffsetY`)
- [x] v1.2 (2026-11-23): the card shows OpenSkiMap's numbers (distance, vertical, slope; speed and ride time for
  the 7 lifts OSM times), measured at refresh
- [ ] The lift a run starts from on its card
- [x] v1.4 (owner's request, 2026-11-24): a resort card (tapped chip, or the run card's resort name) summed from the
  snapshot, and a run's height profile coloured by slope whose hover or drag rings the spot on the map; not yet
  tried on the iPhone
- [x] v1.5 (owner's request, 2026-11-24): a picked run, lift or resort is framed in the map its card leaves clear,
  measured from the card (and the phone's sheet); not yet tried on the iPhone

## Task J18: Deploy every green merge from CI (ADR-0009, accepted 2026-11-23)
Build [SPEC-deploy.md](../SPEC-deploy.md) Phase C of
[ADR-0009](../docs/adr/0009-deploy-from-ci.md); the job runs once the owner does its owner steps (Vercel token, `production` environment
secrets, tiles release). Until then, deploy by hand: J17's API slice merged 2026-11-23 but production still
answers 404 on `/api/ski-lines`. **Scope:** S (one PR: `--staged`, the `deploy` job, docs)
- [ ] Owner steps (SPEC-deploy Phase C), then delete `DEPLOY_PAUSED`; the first run leaves `/api/ski-lines` at 200

## Task J19: Bus and Walk only (SPEC-web-app v1.33, owner's ask 2026-11-25)
Drive mode removed from the API, MCP tools and web app; road routing stays as mode `bus` for the shuttle's path.
- [ ] MCP eval: 34 of 100 questions asked for drive times and were dropped (66 left: 24 en, 21 ja, 21 zh). Write
  walk and bus questions with reference answers checked by hand to bring it back near 100; the next eval run is
  not comparable to `evals/last_run.md` except paired on the 66 kept ids
- [ ] Look on the iPhone: the Walk tab's ranked list and the bus-line pilot's 🚌

## Debt (known gaps no task owns yet; from the 2026-11-18 review and the 2026-11-21 doc check)
Promote a row to a task when it's worth doing. The daily retro (`.claude/skills/daily-retro`) reads this list.
- D1 `place-search`: lodging and Overture snapshots aren't pinned (no Overpass `[date:]`; `latest_release` in
  `services/api/src/hakuba_api/places/refresh_overture.py` takes the newest release). Plan: SPEC-pipeline pinning row
- D2 `poi-destinations`: the POI Overpass query (`pois/refresh_pois.py`) isn't pinned to a date. Plan: same row
- D3 `routing`: Valhalla tiles build from `chubu-latest` (`infra/valhalla/build-hakuba.sh:10`). Plan: same row
- D4 all specs: acceptance checkboxes aren't maintained (51 of 184 ticked), so they can't show progress
- D6 `place-search`: a repeated query word can match one name word twice ("tabi tabi" → ペンション 旅人), and
  sound keys pair "yukinoso" with かにさわ館 and "Hakuba style Inn" with シャトレ山彦 (SPEC-place-search v1.5)
- D7 `place-search`: the readings validator checks ids only (not that each reading's name is still the lodging's
  Japanese name, nor unique ids); aliases accept a bare `https://` and dedupe by casefold, not `normalize`;
  38 readings are ASCII `name_ja` values; DATA-LICENSES says unidic-lite is MIT, but the UniDic data and MeCab
  in fugashi may carry BSD/GPL/LGPL terms, unchecked (#123 review)
- D8 UX panel 2026-11-23 (`docs/ux/2026-11-23-ux-panel.md`): 4 fixed (#143–#145, #147), 2 owner decisions
  and about 20 follow-ups listed there, most severe first (Back leaves the app, `at=` in the bus link, category search)
- D9 `services/api`: the great-circle distance is written three times: `common/geo.py` `km` (2026-11-23) and private
  `_km` copies in `pois/query.py` and `places/index.py`; move both callers to `km` and delete the copies (a refactor PR)
