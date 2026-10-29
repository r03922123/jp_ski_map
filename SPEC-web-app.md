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
