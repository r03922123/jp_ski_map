# Spec: maps-ios-ux (a layout study of the Google Maps iOS app)

> A study, not an app module. It extends [docs/ux/rea-benchmark-workflow.md](docs/ux/rea-benchmark-workflow.md)
> (same loop, same boundaries) from interaction behaviour to **screen layout** on the iPhone. Drafted 2026-11-20.

## Objective

The owner's 2026-11-11 iPhone check of production said the top search card and the bottom sheet take too much
height, so the map in between is too small. This study finds out, with measurements, how the Google Maps iOS app
splits an iPhone screen between top bar, map and sheet in the states our app also has, and turns each
difference into a ranked gap with a proposed fix.

"Reverse engineering" here means **reconstructing the design from what is on screen**: screen recordings,
frame measurements, the accessibility labels iOS shows, and Apple's Human Interface Guidelines. It never means
taking the app apart (see Boundaries).

Users of the result: the owner (decides which gaps to fix), and later build sessions (one spec + PR per gap).

## Scenarios (what to record and measure)

Each one is a state that exists in both apps. The owner records it in the Google Maps iOS app; the agent
measures the same state in our app at the same screen size.

| id | State | Ours |
|---|---|---|
| L1 | Opened, nothing searched: search bar, chips, the collapsed sheet | MapShell + BottomSheet collapsed |
| L2 | Search box focused, keyboard up, suggestions | SearchBox suggestions |
| L3 | A place picked: place sheet at each resting height (peek, half, full) and the drag between them | PinCard / PlaceCard |
| L4 | Directions preview: From/To header, mode row, the options sheet | DirectionsPanel + TripCard |
| L5 | One transit option opened: steps list | bus journey view |
| L6 | Navigation started (drive): top instruction bar, bottom bar | PilotView |

## Measurements per state (both apps, same iPhone, portrait)

- Share of screen height, in %: status bar, top chrome (search bar, chips, header), **visible map**, sheet,
  home-indicator area. Visible map = the rows not covered by any chrome.
- Sheet resting heights (detents) in % of screen height, and which one opens first.
- Search bar and chip height in points; tap target sizes (≥ 44 pt is Apple's guideline).
- Transition time between states, in ms (frames at 10 fps).
- What collapses or hides when the user drags the map or scrolls the sheet.

**Prior evidence.** [BC-L1](docs/ux/behaviour-cards.md) (2026-11-04) already measured Google's map share from the
BC-A1 recording: about 54% with a place card and about 38% in route preview, ±10 px, full screen at 390×844.
This study reuses those numbers for L3 and L4 and extends BC-L1, so it adds no parallel card series. New
observations (L1, sheet detents, timing) go into BC-L1 or a BC-L2 card in the same file, in the existing format: Setup / Observed / Inferred / Unknown / What we take / What we don't take. It also gets
a row in the gap table (below).

## How (commands)

```bash
# 1. The owner records each scenario on the iPhone (Control Centre → Screen Recording),
#    Google Maps app, signed out or with no home/work/saved places on screen, then AirDrops the .mov files to
#    .ux-evidence/ios-layout/ (git-ignored).
# 2. Frames: 10/s for timing, plus one still per resting state
ffmpeg -i .ux-evidence/ios-layout/L3.mov -vf fps=10 .ux-evidence/ios-layout/L3/%04d.png
# 3. Ours, same states at the same CSS size (iPhone 15/16: 393×852), measured by a Playwright spec
pnpm --dir apps/web e2e e2e/layout-share.spec.ts      # prints a JSON row per state
# 4. Ours on the real iPhone (Safari tab and the home-screen app): a full-screen screenshot per state, taken by
#    the owner or with the existing iPhone driver, measured like Google's frames (Playwright can't reach iOS)
# 5. REA on our side only: capture_browser_scenario of our app per state (step_id = L1…L6) before a fix,
#    again after it, then compare_web_captures(before, after) to prove only the intended layout changed
```

**Where REA fits, and where it doesn't (checked 2026-11-20).** REA works on our own app (scripted scenarios,
before/after diffs), and on Google Maps *web* only as a passive observer while a human drives
(rea-benchmark-workflow). It cannot attach to an iPhone, since iOS browsers are WebKit and not CDP. Its Apple
tools (`open_bundle_resources`, `decode_interface_builder`, `inspect_asset_catalog`, `open_binary`) would mean
opening Google's app bundle. This study doesn't do that: see Boundaries.

Measuring a frame: the agent reads the PNG, finds the edges of the top chrome and the sheet (a row scan for
the colour change), and converts pixels to % of height and to points (÷ 3 on a 3× screen). Each number in a
card names the frame it came from.

## Project structure

- `SPEC-maps-ios-ux.md`: this file, holding the gap table.
- `docs/ux/behaviour-cards.md`: BC-L1, extended, and BC-L2 if needed, written in our own words.
- `apps/web/e2e/layout-share.spec.ts`: new. It scans every row with `elementFromPoint` at 3 points across.
  A row counts as map when 2 of the 3 points hit the map, including markers and labels drawn on it. It prints
  `{state, topPct, bandPct, mapPct, bottomPct}`: the chrome above the largest unbroken map band, the band, all
  map rows, and everything below the band (the sheet plus its 4 px margin). It asserts only that some map shows,
  because the numbers are a baseline, not a target yet.
- `.ux-evidence/ios-layout/` (git-ignored): recordings and frames. They never enter git.

## Gap table (filled by the study)

**Approved scope (2026-11-20): L1, L3, L4 first.** Our app has no L3 state (a place picked with no trip
yet): picking a place sets the start, and a resort opens the trip (L4). So "L1b" measures our state between them,
the start set with the ranked list.

**Ours, measured 2026-11-20** by `e2e/layout-share.spec.ts`: 393×852, Chromium mobile emulation, after the
credits fold. Two runs gave identical numbers.

**Denominators differ.** These are shares of the *page* (852 px, no status bar or browser bars). BC-L1's Google
numbers are shares of the *whole screen*, status bar included. On a real iPhone our page also loses the status
bar, and in a Safari tab the address and tab bars too. So the gap is settled by step 4 (full-screen screenshots
of ours on the iPhone, in points), not by this table alone.

| State | Top chrome | Visible map (largest band) | Below the map (sheet) |
|---|---|---|---|
| L1 opened, no start | 8.0% | 91.9% | 0.1% (sheet hidden until a start is set) |
| L1b start set, ranked list | 14.1% | 42.7% | 43.2% |
| L4 directions preview | 20.2% | 36.6% | 43.2% |

| Gap | State | Google (measured) | Ours (measured) | Proposed fix | Size |
|---|---|---|---|---|---|
| pending the owner's recording | L1 | not measured yet | map 91.9% of page | … | … |
| pending step 4 | L3 vs L1b | ≈54% of screen (BC-L1, place card, no top card) | 42.7% of page (top 14.1%) | … | … |
| pending step 4 | L4 | ≈38% of screen (BC-L1: top ≈11%, sheet ≈44%) | 36.6% of page (top 20.2%, sheet 43.2%) | … | … |

So far, from the page-only numbers: in L4 the map share is close to Google's, but our top card is about twice as
tall (20% vs 11%). In L3 Google shows no top card at all. Both stay unconfirmed until step 4 adds the status
bar and browser bars.

Ranked by how much map area the fix gains, then by size.

## Testing strategy

- The Playwright spec above runs locally with `pnpm --dir apps/web e2e e2e/layout-share.spec.ts` (CI runs no e2e:
  it needs Valhalla). Point `E2E_BASE_URL` at one running `pnpm dev`. Next 16.4.3's `next dev` exits on every
  other start to show a security-upgrade notice, so runs that start their own server alternate with "connection
  refused".
- Each later fix PR turns its gap row into an assertion. For example "L1 visible map ≥ X% at 393×852" goes in
  `layout-share.spec.ts`, alongside a before/after screenshot and an iPhone check.
- The study's own check: every number in a card comes with its frame reference, and a second reading of
  2 random frames per state agrees within 2% of screen height.

## Boundaries

- **Never:**
  - Decrypt, decompile, disassemble or inspect the Google Maps app binary or its resources. App Store apps are
    FairPlay-encrypted, and decrypting one means breaking that copy protection. Google's Terms also forbid
    reverse engineering their software.
  - Intercept the app's network traffic, or use any jailbreak or instrumentation tool on it. REA and Frida don't
    touch it.
  - Script or automate the Google Maps app or google.com. A human drives it, and we only watch the screen.
  - Commit Google screenshots, recordings, icons, colours, copy or exact layouts. The repo gets our own words
    and numbers only (the repo is public).
- **Always:**
  - Measure our app in the same state and at the same size before calling something a gap.
  - Write every claim as observed, inferred or unknown.
  - Copy proportions and behaviour, never look.
- **Ask first:** any fix that changes the trip flow rather than layout only, and spending money (none is
  expected).

## Success criteria

- [ ] BC-L1 extended with an L1 measurement, each number with a frame reference, and no personal data in any frame
  used.
- [ ] `layout-share.spec.ts` merged, with our numbers for L1, L1b and L4 at 393×852 in Chromium (done here).
- [ ] The same states measured from full-screen screenshots of ours on the real iPhone (Safari tab and the
  home-screen app), in points of the whole screen.
- [ ] The gap table is filled and ranked, and each of the top 3 gaps has a one-paragraph fix proposal that names
  the files.
- [ ] The owner picks which gaps to build. Each one then gets its own spec section and PR (not part of this
  study).

## What the owner still provides (updated 2026-11-20, after BC-L1 was found)

1. **One Google Maps iOS recording, L1 only** (the app opened, nothing searched, about 10 s). BC-L1 already covers
   L3 and L4.
2. **Six screenshots of our app on your iPhone:** L1, L1b and L4 (the URLs are in `e2e/layout-share.spec.ts`),
   each once in a Safari tab and once from the home-screen icon. They give our full-screen numbers in points,
   which is the comparison that counts.
