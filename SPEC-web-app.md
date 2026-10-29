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
