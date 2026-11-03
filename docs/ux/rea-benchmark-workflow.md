# REA benchmark workflow: Google Maps as the reference, our app as the subject

**Goal.** Fix the [2026-11-03 UX review](2026-11-03-ux-review.md) clusters by copying Google Maps' *interaction model* (what a tap, a sheet or Back does) on laptop and phone. Every decision has evidence behind it, and every fix is proven by a before/after recording of our own app. This extends the "claim → source → what we take" table used for v1.4 in `SPEC-web-app.md`.

**Roles.**
- UX researcher: writes the questions and behaviour cards.
- iOS / Android developers: platform conventions and real-device checks.
- Full-stack engineer: spec, failing test, fix.

## What REA is, as verified on this machine (2026-11-03)

| Fact | How we know |
|---|---|
| **The REA CLI runs** through `npx -y rea-agents@6.8.0 …` (Node 26.9.0 gives an engine warning but works). | `capture-browser-scenario` produced Evidence `ev_ad3d13…` for our app. |
| **REA MCP tools are not available in Claude Code.** Node is below the required ≥ 26.12.1 (or 24.22.1 / 22.23.4), and the registration has drifted. | `rea doctor --client claude_code` |
| **The scripted browser** (`capture_browser_scenario`) can goto, click, fill, press, select, check, wait and make requests. It sets viewport, scale, locale, timezone, colour scheme and reduced motion (default **reduce**: set `no-preference` to see animations). **It has no touch, drag, pinch, long-press or mobile user agent.** | REA source, `src/domain/browserScenarioValues.ts` |
| **The passive tools** (`list_browser_targets`, `observe_web_session`, `inspect_web_page`, `capture_web_screenshot`) attach to a Chrome-family browser over CDP while a **human** acts. | REA `docs/browser-observation.md` |
| **REA cannot attach to the iPhone.** Safari *and* Chrome on iOS are WebKit (Chrome reported `AppleWebKit/605.1.15 … CriOS/156`, `vendor: Apple`); `ios_webkit_debug_proxy` is not CDP. | `list-browser-targets` → `invalid_endpoint_response` |
| **`compare_web_captures` compares two recordings step by step** (matched by `step_id`): screenshot digest, DOM/accessibility text, URL, history, storage. It is meaningful for **our app before vs after**. Google vs us would just be "everything differs". | REA `docs/browser-scenario-contract.md` |

So REA is the **evidence recorder and regression differ**. Gestures stay with Playwright touch tests and the iPhone driver.

## Boundaries (non-negotiable)

- **Google side: a human drives, REA only watches what's on screen.** Google's Terms forbid reverse engineering their services "to extract trade secrets or other proprietary information". They also forbid automated access against `robots.txt`, which disallows most `/maps/` paths. So:
  - no `capture_browser_scenario` against google.com;
  - no script-source export, network bodies, storage or `analyze_web_bundle` on Google pages.
  - Allowed: screenshots, the accessibility tree and DOM structure (roles, labels, layout) of what the user is looking at, as Chrome DevTools would show them.
- **Our side: anything goes** (it's our app): scripted scenarios, network, console.
- **The repo is public.** Google screenshots and recordings live in `.ux-evidence/` (git-ignored). The repo gets only our own words: behaviour cards and spec rows. We copy the interaction model, never assets, icons, colours or copy (`SPEC-web-app.md` v1.1 rule).
- Personal data: observe with a **fresh browser profile, signed out**, with no home/work places, search history or location history in the frame.

## The loop

```
 ①  Question            from a review cluster: "what does a tap on the map do while a route is open?"
      │
 ②  Reference           Google Maps, human-driven
      ├─ laptop: Chrome (fresh profile, --remote-debugging-port=9333) → REA passive capture
      └─ phone:  iPhone Google Maps app + mobile web, screen recording → frames (ffmpeg)
      ▼
     Behaviour card     observed / inferred / unknown + evidence refs (.ux-evidence/)
      │
 ③  Baseline (ours)     REA capture_browser_scenario, same step_ids, laptop + phone-size viewport
      │                 + Playwright touch run + iPhone driver (Safari and Chrome) for gestures
 ④  Decide              "claim → source → what we take" row in the SPEC + a failing test (TDD)
      │
 ⑤  Fix + verify        re-run ③ → compare_web_captures(before, after): only the intended artifacts change
      │                 real-iPhone check (Safari + Chrome for iOS: Chrome has its own pull-down menu)
 ⑥  Ledger              scenario JSON kept in docs/ux/rea-scenarios/ and re-run at each checkpoint
```

### ① Question

For each cluster, write 1–3 questions that have **observable** answers, and say what would change our design. Bad: "how does Google do directions?" Good: "On iPhone, in route preview, what does one tap on empty map do? A long-press?"

### ② Reference observation (Google Maps)

**Laptop (REA passive):**

```bash
# a throwaway, signed-out profile; the human drives it
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$PWD/.ux-evidence/chrome-profile" --remote-debugging-port=9333 \
  "https://www.google.com/maps/dir/Hakuba+Station/Happo-One"
npx -y rea-agents@6.8.0 list-browser-targets http://127.0.0.1:9333
# then: observe-web-session (an observation window while the human does the action),
# inspect-web-page (accessibility + DOM structure only), capture-web-screenshot at each state
```

For Google's phone *web* layout, use Chrome DevTools device mode in that same window. It is a weaker reference than the app: Maps mobile web is not the Maps iOS app.

**iPhone (human + recording).** Record the screen (Control Centre → Screen Recording) while doing the scenario in the **Google Maps iOS app** (the convention iPhone users know), then:

```bash
ffmpeg -i .ux-evidence/rec.mov -vf fps=4 .ux-evidence/frames/%04d.png   # 4 frames/s for timing
```

The agent reads the frames to measure sheet heights as a fraction of the screen, transition timing and what changed. **The iPhone driver (`iphone-drive.mjs`) is never pointed at Google pages**; it serves only our app.

**Behaviour card** (goes in the repo; evidence stays in `.ux-evidence/`):

```md
### BC-A1 Tap on the map while a route is shown (Google Maps iOS app, 2026-11-xx)
- Observed: one tap on empty map → <what happened>; long-press → <…> (rec-A1.mov 00:04–00:09)
- Inferred: <the rule behind it>
- Unknown: <what the recording can't show>
- What we take: <interaction rule, in our words>   · What we don't: <assets / things that don't fit a ski app>
```

### ③ Baseline our app (REA scenario)

Use the same scenario at two viewports (laptop 1440×900; phone-size 393×852 @3×), `timezone: Asia/Tokyo`, `reduced_motion: no-preference`. Template: [rea-scenarios/A-map-click-laptop.json](rea-scenarios/A-map-click-laptop.json). Replace `__CHROMIUM__` with your Chromium path (`ls ~/Library/Caches/ms-playwright/*/chrome-mac*/`):

```bash
sed "s#__CHROMIUM__#$CHROMIUM#" docs/ux/rea-scenarios/A-map-click-laptop.json > .ux-evidence/A.json
npx -y rea-agents@6.8.0 capture-browser-scenario .ux-evidence/A.json --json > .ux-evidence/A-before.json
```

First result (cluster A, 2026-11-03, `ev_ad3d13…`): the `url` artifact per step shows `from=36.69850,137.83760` → after one click and 1.5 s → `from=36.69942,137.85028`. The final screenshot shows "Dropped pin" and a new route.

Gesture clusters (the sheet in F, long-press in A) are outside REA's action set. Baseline those with a Playwright touch script (CDP `Input.dispatchTouchEvent`) and the **iPhone driver in Safari and Chrome**.

### ④ Decide

Add a "Behaviour evidence" table to the SPEC section (the v1.4 format: *Google behaviour | evidence | ours*). Then write the failing unit/e2e test first, as in T72b–T79.

### ⑤ Fix and verify

```bash
npx -y rea-agents@6.8.0 capture-browser-scenario .ux-evidence/A.json --json > .ux-evidence/A-after.json
npx -y rea-agents@6.8.0 compare-web-captures …   # before vs after: expect only the intended steps' url/screenshot to change
```

An unexpected changed artifact is a regression signal. An `unknown` (truncated or missing evidence) is not a pass. Finish with the real-iPhone check, recorded as a short note in `tasks/todo.md`.

### ⑥ Ledger

Keep the scenarios in `docs/ux/rea-scenarios/` (one per cluster) and re-run them at each checkpoint. Once REA's MCP tools are available, the same JSON works as `capture_browser_scenario` arguments.

## Stage 0: setup (needs the user's OK; changes machine configuration)

1. Upgrade Node to ≥ 26.12.1: `brew upgrade node`. This affects the project's toolchain, so run the test suites afterwards.
2. `npx -y rea-agents@6.8.0 setup --client claude_code --dry-run --json`, then review the paths and backups it would write.
3. Apply it (`… setup --client claude_code --yes`) and restart Claude Code, so the REA tools appear in the session.

Until then, everything above works through the CLI.

## First run: questions per P1 cluster

These hypotheses come from general knowledge of Google Maps and are **unverified**. Stage ② exists to confirm or overturn them.

| Cluster | Question for the reference | Hypothesis to check |
|---|---|---|
| A map tap | Phone: tap vs long-press on empty map with a route open. Desktop: left-click vs right-click. | Tap does not change the trip (it toggles the UI or shows a small place card); long-press / right-click offers "Directions from/to here". |
| B Back | Which states (place, directions, navigation) does Back step through on mobile web, and in the app? | Each panel state is a history entry; Back unwinds one level. |
| C trip time | Where is "Leave now / Depart at / Arrive by"? Is it shared across modes? How is a time in another zone shown? | One time control for the whole trip; the zone is shown when it differs from the device's. |
| F reveal | Sheet height after choosing a destination or route; how the map frames the route around the sheet. | The sheet drops to a peek with the ETA summary; the route is framed above it. |
| G transit headline | What is the headline duration of a transit option? | Door-to-door total; walk legs shown inside the itinerary. |
| R offline | What happens with no connection during planning? | A persistent "You're offline" banner; no endless spinner. |
| D entrances | Does a place get a different arrival point by mode (parking for drive, entrance for walk)? | Yes. If confirmed, our C4 "contradiction" may be correct behaviour that needs a *label*, not a fix. |
