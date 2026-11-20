# Spec: web-app

> Module of [SPEC.md](SPEC.md). Depends on all backend modules **through the HTTP API only**.

## Objective
A single-page map UI that feels like Google Maps: a full-screen map, a search box on top, a side panel (bottom sheet on mobile) with 🚌 / 🚗 / 🚶 tabs.

## Screens & flow
1. **Map** (MapLibre, OpenFreeMap style) centered on Hakuba. Shows resort markers, and lodging pins when zoomed to ≥ 14.
2. **Search box** (debounced 300 ms) → result list → selecting a result sets the **origin pin** and opens the panel. Pasting a Google Maps link, or clicking (long-pressing on mobile) the map, also sets the origin. When there are no results, it hints "Paste a Google Maps link or tap the map".
3. **Mode tabs:**
   - 🚗 **Drive:** sort dropdown (all `resort-ranking` keys), filters, date picker (default today). The ranked list shows drive ETA, snow (24 h / depth), crowd badge (estimated), and all factor values on expand. Selecting a resort draws the drive route and step list.
   - 🚶 **Walk:** pick a resort or a bus stop, and see the walking route and ETA. It warns when the walk is > 45 min.
   - 🚌 **Bus:** for each resort, the walk to the stop, the next 3 departures (line badge, depart → arrive, wait), and a link to the source image. Selecting an option draws the walk leg and highlights the boarding stop. A departure time picker defaults to now. A separate "Night bus" toggle shows Line VN departures from the nearest stop.
4. URL state: `?from=lat,lng&mode=drive&resort=happo-one&sort=drive_time&date=…`, so the view can be shared and reloaded.

## Acceptance Criteria
- [ ] Playwright E2E: search "Hotel Hakuba" → select → each of the 3 tabs shows a non-empty result and a line on the map.
- [ ] Mobile width 390 px: the panel becomes a draggable bottom sheet, with no horizontal scroll.
- [ ] Every estimate is labeled ("ETA ~", "Crowd: estimated", snow `asOf`).
- [ ] Each upstream error is shown inside its own panel (e.g. the bus panel fails but drive still works).
- [ ] Map attribution shows OSM, OpenFreeMap, Open-Meteo and Hakuba Valley.
- [ ] Keyboard-navigable search and tabs, visible focus, WCAG AA contrast.
- [ ] API types come only from the generated `api-types.ts`.

## Boundaries
- Never: call upstream services (Valhalla, Photon, Open-Meteo) directly from the browser. Everything goes through `/api`.
- Ask first: adding auth, saved trips, or a PWA/offline mode.

## v1.1
Design reference: Google Maps directions (web and mobile), rebuilt with our own components and styles. We copy the interaction model, not Google's assets, icons or brand colours.

**Destination picker.** In 🚗 / 🚶 a segmented control sits above the list: `⛷ Resorts | 🍜 Food | 🏪 Konbini`.
- Resorts keeps the ranked list.
- Food and Konbini list `GET /api/pois/nearby` results, sorted by ETA. Each row shows the name, the brand/cuisine, the ETA and distance, and the raw opening hours.
- URL state gains `dest=resort:<id>|poi:<id>` and `cat=food|convenience`. The old `resort=` is still read.

**Route on the map:**
- fit the bounds to the whole route on selection, padded for the panel or bottom sheet (respecting `prefers-reduced-motion`);
- origin is a blue dot with a white ring; the destination is a red pin;
- the primary route is drawn as a casing plus a line, and alternates in a muted grey under it;
- an ETA pill sits on each route near its midpoint, e.g. `18 min`. The primary's pill is filled, and the alternates' are outlined. Tapping an alternate's line or pill makes it the primary;
- walking is drawn as a dotted line (round dots);
- hovering or focusing a step highlights its `shapeRange` segment.

**Directions panel (top of the tab):**
- `18 min (7.6 km)`, with `via Route 31` underneath;
- `Arrive ~09:42` (from now, or from the bus departure picker);
- "Typical road speeds, no live traffic or snow. Expect longer in winter." (Our ETA is an estimate, and the label must say so.)
- Option cards, one per route (primary + up to 2 alternates), with time, distance and "via". The selected card is highlighted.
- Steps: a maneuver icon (lucide), the instruction, the street name, and the distance ("300 m", "1.2 km"). The list is collapsed after 5 steps.

**Bus tab:** the journey timeline and map drawing come from SPEC-bus-schedules v1.1, along with the "Expected" badge and no years in the copy.

**Acceptance (v1.1):**
- [ ] E2E: choose a resort in Drive → the map's bounds contain the whole route; an ETA pill is visible; ≥ 1 alternate card when Valhalla returns one; clicking an alternate swaps the primary.
- [ ] E2E: Konbini in Walk → list sorted by ETA → selecting one draws a dotted route and a pill.
- [ ] E2E: Bus option → walk + ride layers both present (`data-route-layers` attribute), timeline shows board time and arrival time.
- [ ] Component: step list renders a maneuver icon per step, and the distance format is "300 m" / "1.2 km".
- [ ] Mobile 390 px: no horizontal scroll, and the pills don't overlap the bottom sheet (fitBounds padding).
- [ ] The browser console is clean on all three flows (no hydration or React key warnings from our code).

## v1.4: Edit the trip like Google Maps: clear a box, add stops (2026-10-30)
User request: "reverse engineer how google maps initiates pointing a location only by 1. cancel the place name in the search box 2. open a mid point box for typing or put point on the map"; user chose **Add a stop (waypoint)**.

**Behaviour evidence (REA method: claim → source → what we take)**
| Google Maps behaviour | Evidence | Ours |
|---|---|---|
| ⋮ → "Add stop" adds a box between start and destination; the route goes through the stops in order | How-To Geek, Android Central, Search Engine Land (multi-stop launch) | "+ Add stop" adds a box between From and To; the route visits stops in order |
| Each box has ✕; clearing a box lets you type again or choose a point on the map | Google Maps app behaviour (observed) | ✕ on every row; an empty, active box is filled by typing (same suggestions as search) or by tapping the map |
| Up to ~9 stops (sources differ: 9 stops / 10 destinations) | the same sources | Up to **5** stops (plenty for a ski day; `/api/route/path` takes 25 points) |
| Stops can be reordered by dragging | How-To Geek, Android Central | Not in v1.4 (↑/↓ buttons later if wanted) |
| Transit with stops | not documented in what we found | **Our decision:** no stops in 🚌 Bus mode (a shuttle can't detour); drive and walk only |

**Design**
- **Trip panel** (replaces the From/To strip): rows *From* · *Stop 1…n* · *To*, each with the name, a Save star and ✕. "+ Add stop" appears when there is a From and a To (drive/walk).
  - ✕ on *From* clears the starting point (as the search box's ✕ does); the stops and the destination **stay listed** while a new start is chosen. ✕ on *To* clears the destination (not in 🚌 Bus, where *To* is the chosen option's stop). ✕ on a stop removes it, including an empty one before anything is typed.
  - A new stop row opens as an **active empty box** with focus: type for suggestions (the same index as the main search) or **tap the map** to drop it there (the hint is the box's placeholder). The map tap goes to the active box **only while the box is on screen** (a start is set, the trip panel is showing, not navigating); otherwise it sets the starting point as before. While placing, a tap on an alternate route line, a resort marker or a saved marker is the stop, not a route/destination/panel change. Clearing the start drops an empty stop box, so the next tap is the new start.
  - After a stop is filled or removed, focus goes to "+ Add stop" (else the trip list), not to the page. On phones the sheet expands when any box in it is focused.
- **Route:** with stops, the route is one request through From → stops → To as *real stops* (`POST /api/route/path` with `stopAtPoints: true`). Each stop gets an "Arrive at stop N" step worded as a stop ("Arrive at stop 1, on the right.", never Valhalla's "Your destination is…"), so the banner announces it. No alternates when there are stops (as in Google). Pilot works unchanged on that route; a **reroute goes through the stops still ahead** (a stop within 30 m ahead of the last on-route point counts as reached) and keeps the trip's stop numbers, so the banner and map circles agree. The stop list is cut only once a reroute succeeds.
- **Map:** stops are numbered white circles (1, 2, …) named "Stop N: <name>", drawn above the route time chips. A tap on one never moves the start or drops a second stop on it.
- **URL:** `stops=lat,lng;lat,lng` keeps them in shared links (coordinates only, at most 5, empty parts ignored; names come back from saved places, else "Dropped pin", like the start).

**Acceptance**
- [x] API: `stopAtPoints` keeps an "Arrive at stop N" step per intermediate point (fixture test); without it, unchanged (pass-through for the bus line).
- [x] Unit: URL round-trip of `stops`; the trip panel adds, fills, removes stops, and clears From/To.
- [x] E2E: add a stop by typing → the route goes through it (its steps include "Arrive at stop 1"); add a stop by tapping the map; remove it → the route goes direct again; the link keeps the stops; bus mode offers no "Add stop".

## v1.6: The planner as an adventure (2026-10-31)
User request: "redesign the whole work like a fun game like pokemon or mario world, but main character is a solo snowboarder".
Choices: game skin + progression; the real map, game-styled; original art and sound made in code; DotGothic16; no classic toggle.
Look and sound: [SPEC-game-theme.md](SPEC-game-theme.md). Stamps, quests, stats: [SPEC-progression.md](SPEC-progression.md).

**Screens**
- **Title screen**, first visit of a session only: drifting snow, the hero, "HAKUBA VALLEY: press start" (a tap, click or Enter; on a touch screen focus then lands on the sheet, not the search box, so no keyboard rises; `?skip-title` and saved state skip it). Shared links (`?from=…`, `#import=`, `#rider=`) skip it.
- ~~**HUD** (top bar): rider name and title, stamps n/10, a quest-log button with a badge for active quests, and the sound toggle.~~ Removed in v1.14.
- **Level select:** the resort ranking as cards. Each card has the world badge (fixed W number), the stamp state, and today's facts (ETA, fresh snow, crowd...). The sort controls and the order work as today.
- **Directions and navigation:** steps in dialog boxes. The hero sprite replaces the position puck; pose by mode, facing the direction of travel. Navigation keeps high-contrast banners.
- **Stamp moment:** a dialog box (SPEC-progression). The quest log was removed in v1.14.
- **Every existing panel** (bus, trip, saved, POIs) gets the frames and font, with no change in behaviour.

**Acceptance**
- [ ] The existing e2e suite passes unchanged: roles, names and behaviour are untouched.
- [ ] Title screen once per session; skipped for shared links and with `?skip-title`; keyboard-operable.
- [ ] ~~HUD shows the title and stamps n/10 from the rider store, and updates when a stamp is earned.~~ Replaced by v1.14: the level card shows ★ stamped.
- [ ] Level cards show the fixed world number and stamp state in any sort order.
- [ ] While navigating, the hero sprite shows the right pose per mode and faces the direction of travel.


## v1.7: On touch, a tap looks and a long-press drops a pin (2026-11-03)
From the [2026-11-03 UX review](docs/ux/2026-11-03-ux-review.md), cluster A: on phones, one tap on the map replaced the start with "Dropped pin", with no undo. Three of four evaluators reported it, and it was verified by script and by REA (`ev_ad3d13…`). It also contradicted "long-pressing on mobile" in Screens & flow 2.

**Behaviour evidence (REA method: claim → source → what we take)**
| Google Maps behaviour | Evidence | Ours |
|---|---|---|
| A tap on empty map during route preview changes nothing | BC-A1 (iPhone recording, 2026-11-03): 13 s with no frame change around the tap | Touch: a tap never edits the trip; it closes an open pin card |
| A long-press drops a pin and opens a card (Directions / Save / Share); the trip isn't edited | BC-A1: pin at 76.0 s, card about 0.1 s later | A long-press (0.5 s, ≤ 10 px of movement: UIKit defaults) drops a pin with a card: **Start here · Go here · Add stop** (each shown only when it applies) |
| A place's card comes from tapping the place | BC-A1 (inferred) | A tap on a hotel pin opens that hotel's card, named |

**Rules**
- **Touch:**
  - A tap on empty map edits nothing.
  - A long-press drops a pin. A second finger (pinch) or more than 10 px of movement (pan) cancels it.
  - The lift-off click that ends a long-press doesn't close the card it opened.
  - An open stop box still takes a tap (the user asked for a point), as in v1.4.
  - Nothing is dropped while navigating.
- **Card:** ✕ or Escape closes it, and so does a tap elsewhere on the map. "Go here" is hidden in 🚌 Bus. "Add stop" appears only when a stop can be added.
- **Hints on touch** say "long-press the map".
- **Mouse is unchanged** (a click picks the start after the double-click window) until the laptop reference (Google's left and right click) is observed.

**Acceptance:**
- [x] Unit tests:
  - MapView: tap, long-press, pan/pinch/early lift, wobble ≤ 10 px, hotel pin, stop box, navigating.
  - PinCard: actions shown only when they apply, ✕/Escape.
  - Hints on touch.
- [x] e2e (`e2e/pin-card.spec.ts`, real CDP touch): a tap keeps the start; long-press → Start here moves it; a tap elsewhere closes the card.
- [x] REA laptop before/after (`ev_fe286f…` → `ev_1ef036…`): the mouse click still picks a start (the URL changes in both; only the clicked coordinate differs).
- [x] Real iPhone, Chrome (2026-11-03, USB recording `.ux-evidence/ours-A1-device.mov`, about 123 s): a long-press shows the card with no iOS callout or loupe.
- [ ] Real iPhone, Safari: the same.

## v1.8: A typed destination, and search results that never replace the start silently (2026-11-03, approved)
**Objective.** A skier who knows where they're going must be able to type it.
- Today, once a start is set, the only text box is the start's (**T**, found by the user on a real iPhone).
- Choosing a resort from that box's suggestions silently **replaces the start**: the trip becomes Cortina → Happo-One (**D1**, severity 4, REA `ev_0bceab1c…`).

Success means:
- typing a destination takes one box and one choice, on phone and laptop;
- nothing a search does ever edits the trip without an explicit choice.

**Behaviour evidence (REA method: claim → source → what we take)**
| Google Maps behaviour | Evidence | Ours |
|---|---|---|
| Directions show two stacked fields, start and destination | BC-A1 (observed: the From/To header in route preview) | The search box above is the **From** box (it already shows the start); the trip panel's To row becomes an editable **To** box |
| Both fields stay editable while a route is shown; typing is a draft, and only a pick changes the trip | **BC-T1** (observed, REA `ev_61e1c0d5…`, `ev_38f08a0b…`, `ev_ae833c23…`) | The To box shows the destination's name; typing keeps the current route until a choice; ✕ clears it |
| Each field's search changes only that field | **BC-T1** (observed: the start's search never touched the destination, and the reverse) | A From-box result sets the start directly, as today; a To-box result sets the destination. D1 came from there being only one box, not from the replace (rule 2 amended 2026-11-04) |

**Reference step (REA, before code).** ② Laptop: you drive Google Maps directions in your own Chrome, started with `--remote-debugging-port=9333` and a fresh signed-out profile. REA `inspect_web_page` records **only the accessibility tree** (roles, names, focus) of the From/To fields: what a tap or focus does, and whether the destination stays editable. That becomes behaviour card BC-T1. The Google boundaries in docs/ux/rea-benchmark-workflow.md apply.

**Rules**
1. **To box** (🚗 Drive, 🚶 Walk):
   - The To row is a combobox named "To", placeholder "Search a destination".
   - It shows the current destination's name; it is empty when there is none, which includes after ✕.
   - Suggestions come from the same index as the start search, biased to the map centre.
   - A resort suggestion selects that resort, as the list does. Any other place becomes a free destination point **with its name** ("To: Lawson …", not "Chosen place").
   - The Save star and ✕ stay. *Amended by v1.13: 🚌 Bus has the same To box.*
   - Typing is a draft (BC-T1): the current destination and its route stay until a suggestion is chosen. Leaving the box (blur or Escape) without choosing puts the current name back. After a choice, the list closes and focus stays in the box.
2. **From box with a start already set:** choosing a result replaces the start, as today; the destination and stops stay. *Amended 2026-11-04, approved:* the first draft opened the pin card here, but BC-T1 showed Google's fields are field-scoped, and with a To box the From box only means "start".
3. **From box with no start:** a result sets the start, as today.
4. The destination's name survives mode switches. Surviving a reload is out of scope here; that is cluster E.

**Commands.**
- `cd apps/web && npx vitest run`
- `npx tsc --noEmit`
- `npx biome check src tests e2e`
- `E2E_BASE_URL=https://127.0.0.1:3443 npx playwright test --workers=3`
- REA scenarios: `npx -y rea-agents@6.8.0 capture-browser-scenario docs/ux/rea-scenarios/D-type-destination-laptop.json` (with `__CHROMIUM__` substituted)

**Structure.** `src/components/TripPanel.tsx` (the To box), `MapShell.tsx` (wiring; the From box goes through `PinCard`). Tests go in `tests/trip.test.tsx`, `tests/SearchBox.test.tsx` and `e2e/journeys/destination-route.spec.ts`. Code style follows the existing components (SearchBox reused, lucide icons, Tailwind tokens).

**Testing.** Red first:
- Unit: TripPanel renders the To combobox (filled and empty); choosing a resort or place calls the right handler.
- e2e: the agent's known-fail tests **T** ("an editable To box") and **D1** ("typing a resort … makes it the destination, not the start") flip to plain passes. D1 is rewritten to type in the To box. The From-box tests in `setting-the-start.spec.ts` stay as they are (rule 2 amended).
- REA laptop before/after on `D-type-destination-laptop.json`: `from` unchanged, the destination changes.
- Real iPhone in Chrome, plus Safari for v1.7.

**Boundaries.**
- *Always:* tests first; full e2e green before commit; the REA before/after.
- *Ask first:* Bus-mode destination typing; changing what the From box means beyond rule 2.
- *Never:* Google assets or copy; scripted access to google.com.

**Acceptance**
- [x] BC-T1 recorded (REA accessibility capture of Google's From/To fields), 2026-11-04
- [x] The To box works on 4 devices; known tests T, D1 and L18 flip; full e2e green (2026-11-04)
- [x] ~~A From-box result with a start set opens the card~~ Rule 2 amended: a From-box result replaces the start (already covered by `setting-the-start.spec.ts`)
- [x] REA before/after diff: compare `ev_00c83cbd…` (before `ev_0bceab1c…`, after `ev_ad259bf7…`)
- [ ] Real-iPhone check

**Open questions**
1. Bus mode: should typing a resort in Bus pick its best bus option? (Proposed: later, as its own spec.)
2. ~~The REA reference step: now or later?~~ Done first, 2026-11-04 (BC-T1).

## v1.9: Map first on phones (2026-11-04, approved: the user's "make the map the main part, get it done")
**Objective.** On a phone the map is the main surface. Today, as measured on the user's iPhone in Safari (390×699):
- the collapsed sheet takes 40 % of the screen;
- the game HUD row uses about half of it;
- after a choice the sheet can stay 80 % tall over the route (cluster F);
- the To box is cut off at the sheet's bottom edge (T-fold, Task 86).

**Reference: behaviour card BC-L1, measured from the user's Google Maps iPhone recording.** Google's sheet rests at about half the screen (≈44–46 %). In route preview its unobstructed map is only ≈38 %, below a top From/To card of ≈11 %. So the map isn't dominant by area. It feels usable because the sheet holds only the answer (title, modes with times, options), the fields sit in the top card, and nothing leaves a tall sheet over the route. *Corrected 2026-11-04 after the measurement: the first draft shrank the peek to 26 %, which BC-L1 doesn't support.*

**Rules (phones, under `md`).**
1. **Trip header on top.** The From box and, in drive and walk, the To box sit stacked in a card fixed to the top of the screen, over the map. The To box carries the destination's Save star. On laptops the same header stays at the top of the side card, like Google desktop.
2. **The sheet holds the answer.** The HUD row (Rider, Quests, Sound) moves out of the header into the sheet body: hidden while the phone sheet rests, shown at the top once it's swiped up, and first in the laptop card. ★ Saved moves into the top card beside the From box, so it's always one tap away.
3. **The peek stays at 40 %** (Google ≈44 %). What changes is what fills it: tabs and ETA/Start (T77) first, the HUD row out of it. The map's fit padding leaves room for the top card.
4. **A choice reveals the result** (F). When the destination changes (a resort, a POI, the To box, Go here, a saved place) the sheet collapses to its peek and the route is fitted between the header and the sheet. The same happens whenever the route on screen changes with both ends set: a new start, mode or stop, or another route option (2026-11-09). Tapping another option re-fits the map, in the list or on the map, on phones and laptops. When the route goes away, as on the Bus tab before a bus is chosen, the sheet stays as it is, because its list is then the answer. "Clear" covers the route and the start and destination markers, which stand above their point, on phones and laptops, and the map re-fits when the window's size changes, waiting for any finger on the map to lift. A start or destination with no route yet is brought into the clear part too.
5. **Focusing the header doesn't expand the sheet.** Its suggestions drop down over the map.
6. In drive and walk the trip panel no longer lists a To row, because the header's To box is the destination. Bus too since v1.13.

**Success criteria.**
- The To box is fully in view on 393×659, 375×667, 393×852 and 360×740 (the known T-fold fail flips).
- The known F fails flip: "expanded sheet: after choosing, the whole route is above the sheet" and "saved place Go here: the whole route is above the sheet".
- With a route shown on 390×699, the unobstructed map is at least Google's route-preview share (≈38 %), the To box is fully visible, and ETA/Start are in the peek.
- Full e2e green, the iPhone WebKit suite green, and a real-iPhone check on the public link.

7. **Dropped pins and choices stay in the clear area.** A dropped pin eases the camera to it (BC-A1), so its card never opens under the top card. A chosen bus trip and its Start scroll into view. The expanded sheet never reaches under the top card: `min(80dvh, 100dvh − 136px)`.
8. **The top card's suggestion lists scroll by finger.** A drag on them scrolls them, except a pull down from their top, which stays away from Safari's pull-to-refresh (T79).

**Boundaries.** *Always:* tests first; keep T77 (ETA/Start in the peek) and T75 (touch targets). *Never:* a second copy of a search box (one instance, positioned per breakpoint).

## v1.10: Back to the lodging: swap start and destination (2026-11-09, approved)
**Objective.** After skiing, get the route from the resort back to the lodging in one tap. Drive and walk could already route it, but only by retyping both boxes.

**Rules.**
1. A ⇅ button sits in the trip card's From row, beside ★ Saved, once there is a start.
2. Tapping it makes the old destination the start and the old start the destination, and reverses any stops. The route, the URL and both boxes follow, and the sheet collapses to show the route (v1.9 rule 4).
3. A resort that becomes the destination is selected again as a resort, so a second tap restores the trip.
4. Bus: replaced by v1.11.
5. A swap clears any chosen bus: its stop was picked for the old start.

**Success criteria.** `e2e/journeys/return-to-lodging.spec.ts` passes on a phone and a laptop: the `/api/routes` request is reversed, both boxes and the link follow, a second tap restores the resort, stops reverse, the From box follows after being retyped, and a chosen bus is cleared.

**Boundaries.** *Out of scope:* a separate "back to My hotel" shortcut.

## v1.11: The shuttle back to the lodging (2026-11-09, approved)
**Objective.** From a resort, Bus mode lists the next shuttles back to the lodging with the walk from the stop where you get off. The rules for which trips count live in SPEC-bus-schedules v1.2.

**Rules.**
1. In Bus mode, a lodging or place set as the destination (the swap's, or one set on Drive or Walk; not a resort, and not a food or konbini row) asks `/api/bus/to-place`. With none, the resort list works as before. A chosen bus only counts while the list it came from is showing.
2. The list has no resort headings. Each row shows the times, the board stop and the walk there, then "Get off <stop> · walk N min". The chosen trip's timeline ends with the walk to the lodging. When a row's stop times aren't published, the list says the stop order may vary.
3. Swap works in Bus mode. The destination is the lodging, else the chosen bus's resort, else the selected resort. With none of these the button is disabled, as in Drive. A swap still clears any chosen bus (v1.10 rule 5).
4. A "Shuttles to resorts" link clears the destination and returns to the resort list. Since v1.13 the To box's ✕ does the same.
5. No hint about Drive or Walk. An empty list says "No direct shuttle to this place after this time."
6. The lodging shows as the destination marker.

**Success criteria.** `e2e/journeys/return-to-lodging.spec.ts` passes on a phone and a laptop: a swap in Bus mode requests `/to-place` with the old start as `to`, rows show the walk from the stop, a second tap restores the resort list, the link clears the destination, the button is disabled with no destination, and the old hint is gone.

**Boundaries.** *Out of scope:* transfers and drawing or guiding the final walk: Start guides you to the stop where you get off.

## v1.12: Only the trip's resort stays on the map (2026-11-09, approved)
**Objective.** Once a trip's start and destination are set, the other resorts' labels only crowd the route.

**Rules.**
1. With a start and a destination set, the only resort label on the map is the destination resort's. A destination that isn't a resort (a lodging, a food or konbini row, a dropped pin) leaves none.
2. Bus: with no bus chosen and no lodging as the destination, every label stays, because no destination is set yet. A chosen bus keeps its resort's label. A lodging as the destination leaves none. Night bus draws no trip, so every label returns.
3. While a stop box is open, every label shows again, so a resort can be tapped as the stop.
4. Resort numbers don't change when others are hidden.
5. Clearing the start or the destination brings every label back.

**Success criteria.** `e2e/journeys/resort-labels.spec.ts` passes.

**Boundaries.** The destination can still be changed from the resort list or the To box. Tapping another resort on the map needs the trip cleared first (decided 2026-11-09).

## v1.13: One bar, then two, like Google Maps (2026-11-09, approved)
**Objective.** The top card opens as one search bar. A search adds a card of next steps under it, and Directions turns it into two equal boxes with ⇅ beside them. It keeps that shape in Drive, Walk and Bus. The owner's words: "show one bar with routing options and star below when search a place" and "make two bar with same length if select Directions". Only the pattern is taken from Google Maps.

**Rules.**
1. **One bar** while there is no destination: one rounded box with a search icon, ✕ while typing, and ★ Saved beside it.
2. **Place card** under the bar whenever there is a start and no destination: Directions (primary), Ski, Food, Konbini, Save. A search still sets the start at once, so the rider, the resort ETAs and the link behave as before. Ski, Food and Konbini pick the destination list in the sheet. Save is the star for that place. In Bus the card has only Directions and Save, because Bus has no food or konbini list and already lists resorts.
3. **Directions** moves the place to To and empties From. A resort becomes the selected resort; anything else a named destination.
4. **Two bars** once there is a destination, in every mode. From and To have equal width. A rail on the left: the rider at From (the same icon the map draws at the start), dots, and the map's flag at To. ⇅ stands on the right, disabled until both ends exist; v1.10 and v1.11 otherwise stand. ✕ on To with a start set returns to one bar and the card.
5. **Under the boxes**, a row with ⊕ "Add destination" (Drive and Walk; it replaces "Add stop" in the sheet and opens the same empty stop box), the destination's Save star, and ★ Saved. On a landscape phone (under 480 px tall) the row sits beside the boxes, since a third row would leave no map. A pin card that would reach under this taller card opens below its pin.
6. **Bus's To box** shows the lodging or place, else the chosen bus's resort, else the resort that is selected or was sent there from Saved.
   - A place chosen there asks `/api/bus/to-place`, as a swap does.
   - A resort chosen there narrows the list to that resort. A bus tapped in the full list names its resort in the box but doesn't narrow the list.
   - Any new pick drops the chosen bus, because it was chosen for the old destination.
   - ✕ and the "Shuttles to resorts" link both clear the destination and the chosen bus, and show every resort.
7. Bus's read-only To row in the trip list goes, because it would contradict the box.
8. **A mouse click with both ends set and no open stop box does nothing.** Clicking a route line still selects it. With no trip a click still sets the start, and an open stop box still takes a click. The touch long-press pin card stays.
9. Each box is one instance. Going from one bar to two moves it and never remounts it, so typing and focus survive (v1.9's "never a second copy").

**Success criteria.** `e2e/journeys/return-to-lodging.spec.ts` (rules 6 and 7) and `e2e/journeys/trip-card.spec.ts` (the rest) pass on a phone and a laptop, and the To box is fully in view at 360×740.

**Boundaries.** *Out of scope:* stops inside the stack, a "close directions" ✕, photos or reviews on the card, Nearby, Share, Send to phone. *Never:* Google's assets, branding or copy.

## v1.14: No Rider, Quests or Sound buttons (2026-11-10, approved)
**Objective.** The sheet shows only the trip. The owner asked to "remove all of buttoms" in the HUD row and chose to remove the buttons and their screens. The game look stays.

**Rules.**
1. **No HUD row.** Rider card, Quests and Sound effects are gone, along with the rider card dialog and the quest log. This replaces v1.6's HUD and v1.9 rule 2's HUD row; ★ Saved stays in the top card.
2. **No sound.** The app makes no sound and never creates an AudioContext. A stored `hakuba:sound` is ignored.
3. **No quests.** No daily quests are made or completed. A stored rider keeps its `quests` field so old saves still load.
4. **A `#rider=` link** opens the app with no dialog. Like other shared links, it still skips the title screen.
5. **Kept:** the pixel look, the title screen, stamps (the ★ in the resort list and the stamp moment), check-in, and the trip stats in storage.

**Success criteria.** `e2e/hud-removed.spec.ts` passes: none of the three buttons exists on a phone (sheet expanded) or a laptop; on a laptop, taps create no AudioContext even with `hakuba:sound` saved as on, and a `#rider=` link shows no dialog. The code that made sound or opened the card is deleted, so screen size can't bring either back.

**Boundaries.** *Out of scope:* the stored trip stats (nothing shows them now; a later change can drop them), the stamp moment's look.

## v1.15: The phone map's first load (2026-11-11, the owner's ask from a production screenshot)
**Objective.** On a phone the first screen is the map and the search card, not a credits bar and an empty sheet.

**Rules (phones, under `md`).**
1. **The sheet waits for a start.** With no start and Saved closed, the sheet is hidden; the top card stays. Any start brings it up collapsed: a picked search result, a shared link with `from`, a restored My hotel, a "Start here". Saved opens it without a start, and so do stops left by a cleared start. A `?mode=` link with no start keeps its mode. This narrows v1.9 rule 3: the 40 % peek applies once there is a start.
2. **The credits fold after five seconds.** They show on first display, as OSM's attribution guidelines require, then fold to the ⓘ, which reopens them. After that first display a new trip folds them again (J10); a shared trip link no longer folds them before it.

**Success criteria.** `e2e/sheet-needs-start.spec.ts` and `e2e/map-credits.spec.ts` pass. Laptops are unchanged.

## v1.16: Full screen on the phone, from the home screen (2026-11-20, the owner's ask)

**Objective.** On a phone the app fills the whole screen, like a native app, with no browser address bar or
tab bar taking map space.

**Decision.** iPhone Safari never lets a page hide its own bars (the Fullscreen API works only on iPad and
for video), so the only way on an iPhone is **Add to Home Screen**: the app then opens in its own window
(`display: standalone`). Android Chrome does the same from "Install app" / "Add to Home screen". This adds a
web app manifest and icons only: **no service worker and no offline mode** (that stays under "Ask first").
`standalone`, not `fullscreen`: iOS ignores `fullscreen`, and keeping the phone's status bar (clock,
battery) avoids putting the search bar under the notch, so no safe-area work is needed at the top.

**What changes.** `app/manifest.ts` (name, `start_url: "/"`, `display: "standalone"`, title-screen navy as
the splash background, PNG icons 192 and 512), `app/icon.tsx` and `app/apple-icon.tsx` drawing the idle rider
sprite on navy, and `metadata.appleWebApp` so iOS opens the home-screen icon as an app.

**Known limit.** iOS keeps a home-screen app's storage apart from Safari's, so saved places made in Safari
don't appear in the home-screen app (and the reverse).

**Done when.**
- [ ] vitest: the manifest has `display: "standalone"`, `start_url: "/"` and a 192 and a 512 PNG icon whose
  `src` the icon route serves.
- [ ] On the dev server: `/manifest.webmanifest`, `/icon/192`, `/icon/512` and the apple icon return 200 with the
  right content type and size; `<head>` has the manifest link, `apple-touch-icon` and
  `mobile-web-app-capable`.
- [ ] CI checks pass and the production smoke test passes after deploy.
- Not checkable here: the real Add to Home Screen on the owner's iPhone.

## v1.17: A low resting height for the sheet (2026-11-20, gap G1 in SPEC-maps-ios-ux)

**Objective.** With a trip or the ranked list open on a phone, the user can drag the sheet down to a low
height and get most of the screen for the map. Google Maps' place sheet rests at 143 pt of an 844 pt screen,
leaving 71% for the map. Our lowest is 40dvh, which leaves 33–39% (BC-L1 update, 2026-11-20).

**Rules** (phones only; from `md` up the sheet is a side card and nothing changes).
- Three states, `data-state` = `low` | `collapsed` | `expanded`. A route or a new destination still opens
  `collapsed`.
- A downward drag or swipe (> 30 px) goes one step down: expanded → collapsed → low. An upward one goes one step
  up: low → collapsed → expanded. A tap or Enter on the handle toggles collapsed ↔ expanded, and from low it
  goes to collapsed.
- `low` is 84 px: the handle and the first row. With a route (`slim`) that row is the ETA and Start, as on a
  landscape phone, kept to one line; otherwise it is the top of the sheet's content (the mode tabs). The body
  scrolls back to the top.
- New content in the sheet (Saved opened, a category list, another mode) brings a low sheet up to collapsed
  (`raiseKey`), so it never shows in an 84 px strip.
- From `md` up (a touch tablet) touch drags don't change the side card's state.
- Keyboard and screen-reader users don't reach `low`: it is a view convenience, and nothing lives only there.
- The map credits sit above whichever height the sheet has (84 px + 32 px when low).
- The handle in `low` reads "Expand directions", with `aria-expanded="false"`.
- Recorded change: a downward drag on a collapsed sheet used to do nothing except keep Safari's pull-to-refresh
  away (T79). It now lowers the sheet, and Safari still never sees it.

**Not in this change:** refitting the camera to the larger map when the sheet goes low (the route stays where
the 40% fit put it).

**Done when.**
- [ ] vitest (`tests/BottomSheet.test.tsx`): the transitions above for handle swipes, body drags and taps.
- [ ] e2e `layout-share.spec.ts`: a new state, L4 with the sheet swiped low, shows map ≥ 60% of the page at
  390×797 and 360×740, against 35% when collapsed, with the ETA on one line. The ETA and Start stay visible and on top (as in `small-phone.spec.ts`).
- [ ] e2e `map-credits.spec.ts` and `small-phone.spec.ts` still pass. A phone-size screenshot of the low sheet.

## v1.18: A two-row trip card (2026-11-20, gap G2 in SPEC-maps-ios-ux; the owner chose "Add destination in the sheet")

**Objective.** The trip card on top ends higher, so the map gets the rows it used. In directions preview the
card was 172 px against Google's ≈95 pt: a third row held "+ Add destination", the destination's ☆ and
★ Saved.

**Rules.**
- Two bars: row 1 is the rail, the From box and **★ Saved**, the same place it has in the one-bar card. Row 2 is
  the rail, the To box and the destination's **☆**. ⇅ stays to the right of both rows. No third row, on any
  screen.
- **"+ Add destination" moves into the sheet**, just above the Trip list (From, then the stops), which is
  where the stop box it opens appears. Above, not under: at 360×740 two stops pushed it under the sticky ETA
  row (measured in review: its bottom at 732 px, the ETA row's top at 676). Its focus handling (TripPanel hands focus back to it after an edit) is unchanged.
- Recorded change: when the sheet is only its 84 px bar (a landscape phone with a route, or the low sheet of
  v1.17) Add destination is one swipe up away; before it was in the card.
- Recorded change: while Saved is open the sheet shows Saved, so Add destination isn't on screen. It comes
  back when Saved closes (v1.13 had it in the top card, where it also closed Saved).
- The expanded sheet's top limit follows the shorter card (`BottomSheet` 100dvh − 180 px, `route-geo`
  `TRIP_CARD_PX` 132), so the strip of map above an expanded sheet sits at 120–176 px.
- The To box's hint is "Where to?": "Search a destination" no longer fits the narrower box at 360 px.
- Trade-off, recorded: ★ and ☆ each take a 44 px slot beside the boxes (the touch-target minimum), so the boxes
  are 48 px narrower: 200 px at 360 px wide (was 248), 233 px at 393. Long names truncate sooner.

**Done when.**
- [ ] e2e `journeys/trip-card.spec.ts`: ★ Saved is right of the From box, ☆ right of the To box, and nothing in
  the card is below the To box. Add destination is inside the sheet, opens Stop 1, and is hidden while Saved is
  open. At 360×740 the To box is at least 200 px wide (was 220).
- [ ] e2e `layout-share.spec.ts` L4 at 390×797: top chrome ≤ 16% of the page (it was 21.6%).
- [ ] vitest: TripPanel shows the Add destination slot under the Trip list. The stops e2e and journeys still
  pass, or fail on main the same way.

## v1.19: The map runs under the status bar (2026-11-20, the owner's ask from an iPhone screenshot)

**Objective.** In the home-screen app the map fills the whole screen, the status bar included, as in Google
Maps. Today the page starts under an opaque status bar, which shows as a solid navy strip above the map.

**Rules.**
- `viewport-fit=cover` and `apple-mobile-web-app-status-bar-style: black-translucent`: the page draws under the
  status bar and the home indicator. The clock is white, so a dark fade (the status bar's height, pointer
  events off) keeps it readable over a light map.
- One set of insets, `--safe-top|bottom|left|right` = `env(safe-area-inset-*)` on `:root`, keeps controls out of
  the system areas:
  - the trip card sits `--safe-top` lower and the sheet `--safe-bottom` higher, both with `--safe-left|right`
    in landscape;
  - the expanded sheet's limit, the credits' lift and the map controls follow the same insets;
  - the navigation views pad their top bar by `--safe-top` (their bottom bars already pad by the bottom inset).
- The camera fit (`route-geo`: `mapPadding`, `pinEaseOffsetY`, `pinCardAnchor`) takes the same insets in px,
  read once from a probe element, so routes and pins stay clear of the moved panels.
- In a Safari tab the insets are 0 in portrait, so nothing moves there. In landscape a notched iPhone has side
  insets in Safari too, and is ≥ 812 px wide, so the md side card and its camera fit also take the insets.
- MapLibre's corner controls are moved with a selector scoped under `.maplibregl-map`: MapLibre's own
  stylesheet loads after ours and resets the corners to 0.
- Phone dialogs pinned to the bottom (ImportDialog, ListPicker) pad their buttons above the home indicator.

**Done when.**
- [ ] vitest: route-geo with `safe = { top: 47, bottom: 34 }` moves the fit's top and bottom by those amounts,
  and the pin rules use the moved edges.
- [ ] e2e `layout-share.spec.ts`, iPhone insets simulated by setting `--safe-top: 47px; --safe-bottom: 34px` at
  390×844: the rows behind the status bar (0–47) are map; the card's top is ≥ 47 px; the sheet's bottom is
  ≤ 844 − 34 (and within 8 px of it); L4-low map ≥ 70% of the screen. Measured: 73.8% (Google's place sheet: 71%).
- [ ] Owner's check on the real iPhone (home-screen app): map behind the clock, clock readable, nothing under
  the notch or the home bar.

## v1.20: No band below the map in the home-screen app (2026-11-20, the owner's iPhone screenshot)
After v1.19, the owner's iPhone home-screen app showed the map behind the clock but a 47 pt
band of page background below the sheet: iOS lays the page out one status bar (47 pt)
shorter than the 844 pt screen, so every `fixed inset-0` layer stopped early.
- `trackViewportGap` (lib/safe-insets) sets `--viewport-gap` on `<html>`: the screen's
  height minus the page's, capped at the status bar's height, and only where
  `navigator.standalone` is true (iOS home-screen apps; Android's screen also counts its nav
  bar). One unlayered rule in globals.css extends every `.fixed.inset-0` layer by it.
- Done when: unit tests for the gap; the e2e "home-screen viewport short by the status bar"
  (797 px viewport on an 844 px screen) sees `main` 844 px tall, and fails without the fix.
- The bottom sheet (its own `fixed` layer) moves down by the same gap, so it stays right above
  the home bar and the credits stay above it. iPad Split View (window narrower than the
  screen) gets no gap. Owner's check on the real iPhone is the last part of done.
- Not ours: the frosted strip behind the clock is drawn by iOS; the app has no blur.

## v1.21: A viewport check page for the owner's iPhone (2026-11-20)
v1.20's fix didn't change the owner's phone: the 47 pt band stayed, so one of the numbers it
relies on reads differently on the device, and Chromium can't show which. `/viewport-check`
prints what iOS reports (standalone, screen, inner, visualViewport, safe insets, the gap)
and draws one coloured column per CSS height (inset-0, 100vh/lvh/dvh/svh, inset-0 extended
by the top inset), so a screenshot from the home screen shows which reaches the screen's
bottom. A button hides the status-bar fade, to see whether the frosted strip is iOS's own.
Diagnostic only; removed once the band and blur are fixed.

## v1.22: The band, take two, and a sheet on the bottom edge (2026-11-20, the owner's iPhone)
v1.20 changed nothing on the owner's iPhone. `/viewport-check`, read in a Safari tab, showed
a tab's top inset is 0 (and its viewport 145 pt short, for its toolbars). Not measured in the
home-screen app itself, so v1.20's `navigator.standalone` gate is the likely cause, not a
proven one. The gate is now the shortfall itself: on Apple's WebKit (`navigator.vendor`),
when the viewport is short of the screen by exactly the top inset (±1 px), the layers extend
by it; any other shortfall (a tab, a shorter window) gives 0. Measured again 1 s after load.
- Google Maps layout: on phones the sheet sits on the screen's bottom edge, full width
  (inside the side insets); `pb-(--safe-bottom)` keeps its content above the home bar and
  every phone height adds that padding back, so the sheet's top edge stays where it was.
- Done when: the e2e sheet bottom is the screen's bottom (844) with 34 px padding, in the
  notch simulation and in the short-viewport one; the unbroken map band with the sheet low
  stays ≥ 63% (the docked sheet now covers the strip of map by the home bar). Owner's check
  on the real iPhone is the last part.
- Open: the frosted strip behind the clock is drawn by iOS, not the app.

## v1.23: Collapse the side panel on a laptop (2026-11-20, BC-L2)
The owner asked for Google Maps' layout on the laptop too. Measured (BC-L2): Google's directions card is
408 px wide and full height, like our 384 px card, so the split already matches; the gap is that Google's
card can be collapsed and ours can't, so a trip always hides 400 px of map.
- From `md` up, a "Collapse side panel" button (24 × 48; 44 wide on touch screens, growing outward) sits
  just outside the card's right edge, centred on the card,
  `aria-expanded` and `aria-controls` set. Pressing it slides the card left out of the window and makes
  its content `invisible` (so Tab skips it); the button stays, now "Expand side panel", at the window's left
  edge, right of the safe-area line (a landscape iPhone's notch). Pressing it again brings the card back. Focus stays on the button.
- The camera doesn't move on either press (as Google's). Whatever opens inside the card brings it back: a
  new destination (`collapseKey`), a new route (`revealKey`, e.g. "Start here" from a pin), and new content
  (`raiseKey`: Saved from a saved marker, an imported list).
- Phones (below `md`) are unchanged: the button is not rendered there (`hidden md:flex`).
- Done when: BottomSheet unit tests cover the toggle, its labels and the reopen on a new destination;
  `e2e/side-panel.spec.ts` at 1440×900 shows a tap at the card's old centre lands on the map after
  collapsing, the expand tab is on screen and on top, the map's centre is unchanged, and expanding brings
  the card back; on a touch 844×390 screen with a 47 px notch the tab sits beside the card, and once
  collapsed it rests right of the notch, on top. Not done: durations on the mode tabs (cluster G).
