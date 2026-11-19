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

The output for each state is one **layout card** (LC-L1 … LC-L6) in [docs/ux/behaviour-cards.md](docs/ux/behaviour-cards.md),
in the existing format: Setup / Observed / Inferred / Unknown / What we take / What we don't take. It also gets
one row in a gap table (below).

## How (commands)

```bash
# 1. The owner records each scenario on the iPhone (Control Centre → Screen Recording),
#    Google Maps app, signed out or with no home/work/saved places on screen, then AirDrops the .mov files to
#    .ux-evidence/ios-layout/ (git-ignored).
# 2. Frames: 10/s for timing, plus one still per resting state
ffmpeg -i .ux-evidence/ios-layout/L3.mov -vf fps=10 .ux-evidence/ios-layout/L3/%04d.png
# 3. Ours, same states at the same CSS size (iPhone 15/16/17: 393×852), measured by a Playwright spec
pnpm --dir apps/web e2e e2e/layout-share.spec.ts      # prints a JSON row per state
# 4. Ours on the real iPhone (Safari and the home-screen app), with the existing iPhone driver
```

Measuring a frame: the agent reads the PNG, finds the edges of the top chrome and the sheet (a row scan for
the colour change), and converts pixels to % of height and to points (÷ 3 on a 3× screen). Each number in a
card names the frame it came from.

## Project structure

- `SPEC-maps-ios-ux.md`: this file, holding the gap table.
- `docs/ux/behaviour-cards.md`: the layout cards LC-L1 to LC-L6, written in our own words.
- `apps/web/e2e/layout-share.spec.ts`: new. It measures our states with `getBoundingClientRect` and prints
  `{state, topPct, mapPct, sheetPct}`. It asserts only that the states render, because the numbers are a
  baseline, not a target yet.
- `.ux-evidence/ios-layout/` (git-ignored): recordings and frames. They never enter git.

## Gap table (filled by the study)

| Gap | State | Google (measured) | Ours (measured) | Proposed fix | Size |
|---|---|---|---|---|---|
| … | L1 | visible map …% | visible map …% | … | S/M/L |

Ranked by how much map area the fix gains, then by size.

## Testing strategy

- The Playwright spec above runs in CI like the other e2e specs (it needs the map worker; see CLAUDE.md).
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

- [ ] LC-L1 … LC-L6 written, each number with a frame reference, and no personal data in any frame used.
- [ ] `layout-share.spec.ts` merged, with our numbers for the same 6 states, on desktop Chromium at 393×852
  and on the real iPhone (Safari and the home-screen app).
- [ ] The gap table is filled and ranked, and each of the top 3 gaps has a one-paragraph fix proposal that names
  the files.
- [ ] The owner picks which gaps to build. Each one then gets its own spec section and PR (not part of this
  study).

## Open questions (for the owner)

1. **You need to record 6 short screen recordings** (L1–L6, about 20 s each) on your iPhone in the Google Maps
   app. Recommended: Hakuba Station → Happo-One, the same trip as BC-A1, so the cards are comparable.
2. **Scope:** start with L1, L3 and L4, the states where the map share hurt most in your 2026-11-11 check, and add
   L2, L5 and L6 only if those three leave questions. Recommended: yes. It halves the recording and measuring.
