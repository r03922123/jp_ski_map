# Spec: pilot (turn-by-turn navigation)

> Module of [SPEC.md](SPEC.md). Depends on: `routing` (routes, reroutes), `bus-schedules` (bus journey).
> Consumed by: `web-app`. Added 2026-10-30 (v1.3).
> Decisions: no fake traffic (say so plainly); test on a phone over HTTPS on home Wi-Fi; simulated GPS in tests.

## Objective
When the user taps **Start** on a drive, walk or bus route, the app becomes a navigator like Google
Maps': it follows the user's GPS position, shows the next turn and the time and distance left,
re-routes when they leave the route, and, on the bus, shows the coming stops and says when to get off.
Mobile is the main target; it also works on a desktop browser that has location.

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
- Bottom bar: arrival `HH:mm`, `N min`, `x.x km`, then "Live traffic unavailable", 🔇 mute, and ✕ Exit.
- Screen Wake Lock while piloting (re-requested on `visibilitychange`). Voice: `speechSynthesis` reads the next instruction at 500 m and 100 m (drive) or 50 m and at the turn (walk); voice is on by default, with a mute toggle that is remembered. Vibration (`navigator.vibrate`) on turns where supported.
- Reroute: when the counter trips, call `/api/routes` from the current fix to the same destination; at most one reroute every 10 s; if it fails, keep the old route and show "Can't reroute — continue to the blue line".

**Bus pilot (one journey: walk → wait → ride → arrive):**
1. *Walk:* normal walk navigation to the boarding stop.
2. *Wait* (within 30 m of the stop): "Line V · departs 08:10 · in 6 min", counting down; "Expected" if the time is projected from last season.
3. *Ride:* starts once the departure time has passed and the user is moving away along the ride line (or taps "I'm on the bus"). Shows a list of upcoming stops with their scheduled times (or "time not published"), "N stops to go", and the puck on the ride line. When the alight stop is next: banner "Get off at Happo Bus Terminal — next stop", voice and vibration. There's no live bus position, so times are labelled *scheduled*.
4. *Arrive:* within 30 m of the alight stop (or its resort) → "You've arrived at Happo-One".

**Permissions & failure:** location is requested only when Start is tapped. If it's denied, the app explains how to enable it and stays on the overview. Low accuracy (> 100 m) shows a "Weak GPS" chip and pauses off-route counting. Location doesn't work in an insecure context, so the app shows "Pilot needs https".

**Phone testing:** `pnpm dev:https` runs `next dev --experimental-https --hostname 0.0.0.0`, so the phone opens `https://<Mac LAN IP>:3000` and trusts the mkcert CA once. `/api` is already proxied by Next, so only the web port is exposed, and only on the home network.

## Acceptance Criteria
- [ ] Unit (`nav/`): projection on/off route with the 50/20 m radii and widened by accuracy; forward-only matching on a route that loops back; off-route counter (+1/+2, unchanged distance ignored, trips at > 10); remaining time and distance monotone along a real route fixture; next maneuver and "then"; arrival tolerance.
- [ ] E2E (Playwright `setGeolocation` sequence): Start drive → banner shows the first maneuver → fixes along the route → the remaining km falls and the covered part turns grey → off-route fixes → "Rerouting…" → a new route from the current position → fixes at the end → "You've arrived".
- [ ] E2E bus: walk → wait countdown → ride with the stops list → "Get off … next stop" → arrived.
- [ ] Location denied → message, no crash; Exit returns to the overview with the same origin and destination.
- [ ] 390 px: banner, bottom bar and Re-centre don't overlap; every control has an accessible name.
- [ ] Manual: on the user's phone over `pnpm dev:https`, a short real walk shows the puck following and the remaining distance falling.

## Boundaries
- Always: label bus times *scheduled/expected*, say plainly there's no live traffic, and stop GPS and the wake lock on Exit or when the page is hidden for more than 10 minutes.
- Never: send position fixes anywhere except the reroute request (origin coordinate only), store a location history, or invent traffic.
- Ask first: TomTom/HERE or another traffic feed; background tracking; exposing the dev server beyond the LAN.
