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
- **HUD** (top bar): rider name and title, stamps n/10, a quest-log button with a badge for active quests, and the sound toggle.
- **Level select:** the resort ranking as cards. Each card has the world badge (fixed W number), the stamp state, and today's facts (ETA, fresh snow, crowd...). The sort controls and the order work as today.
- **Directions and navigation:** steps in dialog boxes. The hero sprite replaces the position puck; pose by mode, facing the direction of travel. Navigation keeps high-contrast banners.
- **Stamp moment and quest log:** dialog boxes (SPEC-progression).
- **Every existing panel** (bus, trip, saved, POIs) gets the frames and font, with no change in behaviour.

**Acceptance**
- [ ] The existing e2e suite passes unchanged: roles, names and behaviour are untouched.
- [ ] Title screen once per session; skipped for shared links and with `?skip-title`; keyboard-operable.
- [ ] HUD shows the title and stamps n/10 from the rider store, and updates when a stamp is earned (e2e with mocked geolocation at a resort base).
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
   - The Save star and ✕ stay. In 🚌 Bus the To row stays read-only (it is the chosen option's stop).
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
6. In drive and walk the trip panel no longer lists a To row, because the header's To box is the destination. Bus keeps its read-only To row.

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
4. Bus: the button is disabled and the trip card says "Way back from a resort: use Drive or Walk.", because the bus query only answers trips to a resort. It is on-screen text since touch browsers don't show tooltips.
5. A swap clears any chosen bus: its stop was picked for the old start.

**Success criteria.** `e2e/journeys/return-to-lodging.spec.ts` passes on a phone and a laptop: the `/api/routes` request is reversed, both boxes and the link follow, a second tap restores the resort, stops reverse, the From box follows after being retyped, the bus button is disabled with its reason on screen, and a chosen bus is cleared.

**Boundaries.** *Out of scope:* bus trips back from a resort (a later spec: the timetables already hold return directions, but `bus_options` only offers resort stops), and a separate "back to My hotel" shortcut.
