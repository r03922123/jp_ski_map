# Spec: pilot (turn-by-turn navigation)

> Module of [SPEC.md](SPEC.md). Depends on: `routing` (routes, reroutes), `bus-schedules` (bus journey).
> Consumed by: `web-app`. Added 2026-10-30 (v1.3).
> Decisions: no fake traffic (say so plainly); test on a phone over HTTPS on home Wi-Fi; simulated GPS in tests.

## Objective
When the user taps **Start** on a drive, walk or bus route, the app becomes a navigator like Google
Maps': it follows the user's GPS position, shows the next turn and the time and distance left,
re-routes when they leave the route, and, on the bus, shows the coming stops and says when to get off.
Pilot is offered **only on touch-first devices** (phones, tablets); see *Devices* below.

### Behaviour evidence (REA-style: claim → source → limits)
| Behaviour | Evidence | What we take |
|---|---|---|
| Start / Close; recentre with "Your location"; switch heading-up / north-up with the compass | [Google Maps Help 9770907](https://support.google.com/maps/answer/9770907) | Start, ✕ Exit, Re-centre, and a compass toggle |
| Distance, travel time and ETA shown together in the bottom bar | Android Central, "Google Maps 8.0" walkthrough (old, but the layout is unchanged) | Bottom bar: **arrival time · min left · km left** |
| Automatic rerouting | Droid Life (Google traffic rerouting) | Off-route → automatic reroute, with a "Rerouting…" toast |
| On-route matching radius: car 50 m, pedestrian 20 m, widened to the GPS accuracy when that's larger | Organic Maps source, `libs/routing/routing_settings.cpp` (Apache-2.0); `route.cpp` `MoveIterator` | The same thresholds (our own implementation) |
| Off-route = > 10 "moving away" points: +2 per fix when moving ≥ 3 km/h (car), else +1; fixes whose distance doesn't change are ignored | Organic Maps `routing_session.cpp` `OnLocationPositionChanged` (`kOnRouteMissedCount = 10`) | The same counter; reroute when it trips |
| Projection searches forward from the current position on the route (no jumping back to earlier parts of the route) | Organic Maps `followed_polyline.cpp` `GetBestMatchingProjection` | Forward-window projection |
| Arrival within 20 m (car) / 15 m (walk) of the end | Organic Maps `m_finishToleranceM` | The same |
| Lane guidance, live traffic colouring | Google; needs lane data or a traffic feed we don't have | **Not doing**; the screen says "Live traffic unavailable" |

## Design
**Pure core (`apps/web/src/lib/nav/`), unit-tested with no browser:**
- `project(route, fix, fromIndex)` → `{ onRoute, index, t, point, offsetM }`, searching segments `fromIndex…fromIndex+N` (≈ 1 km ahead) with radius `max(threshold, accuracy)`.
- `NavSession` reducer, `(state, fix) → state`: phases `following | offRoute | rerouting | arrived`, the moving-away counter, and the last good projection.
- `progress(route, projection)` → remaining distance (along the line), remaining seconds (the rest of the current step, pro rata, plus later steps' Valhalla durations), the current step, the next maneuver with its distance, and a "then" maneuver when it's < 300 m after the next.
- `cameraFor(state, speed, heading)` → centre, bearing (GPS heading when speed > 1.5 m/s, else the route's bearing), pitch (drive 60°, walk 45°), zoom (by speed: 17.5 → 15.5).

**Before the first match (approach):** routes start on the nearest road, not at the hotel door, so the first fixes are often outside the matching radius. Until the first on-route match, being ≤ 150 m (walk) / 250 m (drive) from the route's start shows "Head to the route · *n* m" and doesn't count towards leaving the route. Without this, GPS jitter at the door would trip a reroute onto the same road, again and again. A start farther away counts normally, so it reroutes from where the user is. *(Found by the T42 e2e; Organic Maps doesn't need it because its routes begin at the GPS position.)*

**Position source:** `watchPosition({ enableHighAccuracy: true, maximumAge: 1000 })` behind a `PositionSource`
interface. A dev-only `SimulatedSource` replays the route at a chosen speed (`?simulate=1`, also a
"Simulate" button in dev builds) so the full flow can be watched on a desktop.

**UI (pilot screen, full-screen over the map):**
- Top banner: maneuver icon, distance to it, instruction or street, and a "Then ↱" chip.
- Map: puck (arrow, snapped while on the route), the route ahead in blue and the part already covered in grey, camera following with heading-up. If the user pans, following pauses and **Re-centre** appears.
- Bottom bar: arrival `HH:mm`, `N min`, `x.x km`, then "Live traffic unavailable", and ✕ Exit.
- Screen Wake Lock while piloting (re-requested on `visibilitychange`). Guidance is on screen only: no voice and no vibration.
- Reroute: when the counter trips, call `/api/routes` from the current fix to the same destination; at most one reroute every 10 s; if it fails, keep the old route and show "Can't reroute — continue to the blue line".

**Bus pilot (one journey: walk → wait → ride → arrive):**
1. *Walk:* normal walk navigation to the boarding stop.
2. *Wait* (within 30 m of the stop): "Line V · departs 08:10 · in 6 min", counting down; "Expected" if the time is projected from last season.
3. *Ride:* starts once the departure time has passed and the user is moving away along the ride line (or taps "I'm on the bus"). Shows a list of upcoming stops with their scheduled times (or "time not published"), "N stops to go", and the puck on the ride line. When the alight stop is next: banner "Get off at Happo Bus Terminal — next stop". There's no live bus position, so times are labelled *scheduled*.
4. *Arrive:* within 30 m of the alight stop (or its resort) → "You've arrived at Happo-One".

**Permissions & failure:** location is requested only when Start is tapped. If it's denied, the app explains how to enable it and stays on the overview. Low accuracy (> 100 m) shows a "Weak GPS" chip and pauses off-route counting. Location doesn't work in an insecure context, so the app shows "Pilot needs https".

**Phone testing:** `pnpm dev:https` runs `next dev --experimental-https --hostname 0.0.0.0`, so the phone opens `https://<Mac LAN IP>:3000` and trusts the mkcert CA once. `/api` is already proxied by Next, so only the web port is exposed, and only on the home network.

## Acceptance Criteria
- [x] Unit (`nav/`): projection on/off route with the 50/20 m radii and widened by accuracy; forward-only matching on a route that loops back; off-route counter (+1/+2, unchanged distance ignored, trips at > 10); remaining time and distance monotone along a real route fixture; next maneuver and "then"; arrival tolerance.
- [x] E2E (Playwright `setGeolocation` sequence), *run on a walk route; drive takes the same code path with the 50 m radius unit-tested*: Start → banner shows the first maneuver → fixes along the route → the remaining km falls and the covered part turns grey → off-route fixes → "Rerouting…" → a new route from the current position → fixes at the end → "You've arrived".
- [x] E2E bus: walk → wait countdown → ride with the stops list → "Get off … next stop" → arrived.
- [x] Location denied → message, no crash; Exit returns to the overview with the same origin and destination.
- [x] 390 px: banner, bottom bar and Re-centre don't overlap; every control has an accessible name.
- [ ] **(yours)** Manual: on the user's phone over `pnpm dev:https`, a short real walk shows the puck following and the remaining distance falling.

## Boundaries
- Always: label bus times *scheduled/expected*, say plainly there's no live traffic, and stop GPS and the wake lock on Exit or when the page is hidden for more than 10 minutes.
- Never: send position fixes anywhere except the reroute request (origin coordinate only), store a location history, or invent traffic.
- Ask first: TomTom/HERE or another traffic feed; background tracking; exposing the dev server beyond the LAN.

## Devices (v1.3.1, 2026-10-30): no pilot on laptops
A laptop or desktop isn't carried while driving or walking, and its "location" is Wi-Fi-based (often hundreds of metres off), so pilot mode is removed there.
- **Laptop/desktop** = the primary pointer is fine (mouse or trackpad): `matchMedia("(pointer: coarse)")` is false. Phones and tablets keep pilot, including iPads (which report a Mac user agent, so the user agent can't decide this). Touchscreen laptops count as laptops (their primary pointer is the trackpad).
- On a laptop the **Start** buttons (drive/walk directions, and the bus journey) aren't shown. Routes, ETAs and step lists are unchanged.
- The answer is reactive: if the primary pointer changes (an iPad gets a trackpad keyboard), Start appears or disappears. A session that is already running is never cut off.
- Server render and first paint: no Start, decided after hydration (no hydration mismatch).
- Dev builds only: `?simulate` keeps Start on a laptop, so the simulated drive can still be watched on a desk. It is kept for the tab (sessionStorage) because the URL mirror drops it from the address bar; `?simulate=0` turns it off.

**Known limits (accepted, from the adversarial review 2026-10-30)**
- Firefox on a **Windows 10** touchscreen laptop with *Tablet mode* switched on reports a coarse pointer, so it is offered Start. A platform allowlist would avoid that but would remove pilot from real Windows tablets (a Surface without its keyboard). Windows 10 is past end of support, so we accept it.
- `pnpm dev:https` allows this Mac's addresses *as they were at start*. After a network change (new IP), restart it. The startup message says so.

**Acceptance**
- [x] Unit: coarse pointer → available; fine → not (also with touch points: a touchscreen laptop); dev + `?simulate` → available, kept across a reload; production ignores `?simulate` (hook-level); pointer change updates both ways; server render says no. *Each rule is mutation-checked: breaking it fails a test.*
- [x] E2E desktop (fine pointer): directions show no Start; bus option shows no Start once its walk route has loaded; `?simulate` Start replays the route with no GPS permission.
- [x] E2E mobile emulation (coarse pointer, touch): the existing pilot journeys pass; a running session survives a pointer flip to fine (CDP touch emulation off), and Start then follows the device.
- [x] Real iPhone over USB (ios_webkit_debug_proxy): `(pointer: coarse)` is true and Start is shown.

## Bus stops, before and after Start (v1.3.2, 2026-10-30)
The user asked to see every stop the shuttle passes, both when choosing a bus and while travelling.
- **Before Start** (bus tab, chosen option): the Journey timeline lists **every stop** from boarding to getting off, in order, with its scheduled time ("time not published" where the timetable has none). The boarding and alighting stops are emphasised. The ride summary ("Line V · 3 stops · 28 min") stays.
- **After Start:**
  - *Walk to the stop:* below the footnote ("Then Line V from … at 08:11"), the same list of stops.
  - *Wait* and *Ride:* the full list, never cut short. During the ride, passed stops are marked as passed (struck through, plus "passed" for screen readers), the next stop is highlighted, and the stop to get off at is bold. The list scrolls if it's long; the next stop stays visible.
  - *Map:* in every phase of a bus journey the bus line and its stop dots are drawn, so the coming stops are visible on the map too.

**Acceptance**
- [x] Component: the Journey lists all ride stops with times / "time not published"; the bus pilot lists all stops in wait and ride (no cap), marks passed and next; the walk leg shows the list.
- [x] E2E (bus fixture): the stop names are visible before Start, during the walk, while waiting and while riding (a passed stop marked passed); the map shows the line's stops during the journey.

## Map label font (v1.3.2)
Our own symbol layers (lodging names) named no font, so MapLibre asked OpenFreeMap for "Open Sans Regular", which it doesn't serve: a 404 console error on every zoomed-in view (seen on the iPhone as Next's "1 Issue"). Every symbol layer we add names a font the style serves ("Noto Sans Regular").
- [x] E2E: zoomed in where lodging labels show (zoom ≥ 15), no failed font request and no console error.

## iPhone polish (v1.3.3, 2026-10-30), found on the user's iPhone over USB
- **No zoom-on-focus:** iOS zooms the page in when a focused field's text is under 16px and stays zoomed (the right edge looked cut off). On touch devices (`pointer: coarse`) form fields use 16px. Laptops keep the compact text.
- **No hydration warning from the browser:** Chrome on iOS adds `__gcrremoteframetoken` to `<html>` before React hydrates. Attribute differences are ignored on `<html>` only (`suppressHydrationWarning` there).
- [x] E2E: on a touch phone every text field / select is ≥ 16px; on a laptop the search box stays 14px.
- [x] E2E: an attribute injected on `<html>` before hydration logs no hydration error.

## Preview when you're far away (v1.3.4, 2026-10-30), user decision "Offer Preview"
Found on the user's iPhone: pressing Start far from the route (the user wasn't in Hakuba) made the navigator ask for a new route from the phone's position every 10 s, and each request failed (404: outside the routing area).
- **Far** = the phone's position is more than **1 km** from the route's start.
- **Before tapping:** if the browser already has location permission (`navigator.permissions` says `granted`), the app reads the position quietly. When far, the drive/walk button reads **Preview** ("Preview route") instead of Start. No permission yet: it stays Start (asking would mean a prompt nobody requested).
- **After tapping Start:** if the first fix turns out far, the session switches to **Preview** by itself, with "You're far from this route: previewing it".
- **Preview** plays the route along its line (the simulated source: drive 15 m/s, walk 5 m/s) with the normal turn banner and progress. It uses no GPS, never reroutes, and shows a "Preview" label. Exit as usual.
- **Rerouting is never requested from more than 50 km from the destination** (outside any route the service can plan); the "Can't reroute" note shows instead.
- Bus journeys: when far from the boarding stop, the bus Start shows "Bus guidance works near the stop" and doesn't start. (A bus journey depends on the real time and place; there is no bus preview.)
- The phone's position is never shown or stored; the note says "far", not where you are.

**Acceptance**
- [x] Unit: far/near decision (1 km); reroute guard (50 km); the permission-granted position check (granted → position read; prompt/denied → unknown, no prompt).
- [x] E2E: GPS far away + permission granted → the button reads Preview, the route plays with no GPS-based reroute request; GPS far + permission granted only after load → Start, then automatic switch to Preview with the note; GPS near → Start navigates normally.
- [x] E2E bus: far from the stop → message, no session.
