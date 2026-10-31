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
- **Route:** with stops, the route is one request through From → stops → To as *real stops* (`POST /api/route/path` with `stopAtPoints: true`). Each stop gets an "Arrive at stop N" step worded as a stop ("Arrive at stop 1, on the right.", never Valhalla's "Your destination is…"), so the banner and voice announce it. No alternates when there are stops (as in Google). Pilot works unchanged on that route; a **reroute goes through the stops still ahead** (a stop within 30 m ahead of the last on-route point counts as reached) and keeps the trip's stop numbers, so voice and map circles agree. The stop list is cut only once a reroute succeeds.
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
- **Title screen**, first visit of a session only: drifting snow, the hero, "HAKUBA VALLEY: tap to start" (Enter or a tap; `?skip-title` and saved state skip it). Shared links (`?from=…`, `#import=`, `#rider=`) skip it.
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

