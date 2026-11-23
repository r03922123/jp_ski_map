# Spec: game-theme

> Module of [SPEC.md](SPEC.md). Depends on: nothing (browser only). Consumed by: `web-app`.
> Added 2026-10-31 (v1.6). Decisions: a game skin over the real planner; the real map restyled, not
> replaced; original art and sound made in code; replaces today's look (no toggle). Since v2 (2026-11-20) the UI
> uses the device's sans-serif and the Maps look (see "UI frames and type").

## Objective
Make planning a ski day feel like starting an adventure: a pixel snowboarder crossing a snowy
overworld to reach the valley's resorts. The genre is the classic top-down overworld adventure.
**Everything is original:** no character, name, sprite, sound, item or screen layout from any
existing game.

The game look never costs information. Every ETA, departure time, distance and route stays exact,
readable and screen-reader friendly. The theme is presentation only: it never changes what the planner computes.

## The hero
- **An original snowboarder:** beanie with a pom, goggles, orange jacket, teal board. The default name
  is "Rider". (Renaming was on the rider card, removed in web-app v1.14.)
- **A 24×24 pixel sprite, defined in code** as a palette plus rows of palette indices (`lib/game/sprites.ts`).
  It's drawn to a canvas at 1× (`lib/game/render.ts`), and the browser scales it up with CSS
  `image-rendering: pixelated` (`PixelSprite.tsx`).
- **Sprites use whole-number scales only** (1×, 2×, …). A fractional scale such as 1.5× gives 4.5
  device pixels per sprite pixel on a 3× phone, so some sprite pixels come out wider than others.
- **Poses, chosen from the trip's mode and state:**
  | Pose | Frames | When |
  |---|---|---|
  | `idle` | 2 (slow bob) | planning, no trip |
  | `walk` | 4 (board on back) | walk mode, walking legs of a bus journey |
  | `ride` | 2 (crouched on board) | arrived at a resort, stamp moment |
  | `bus` | 2 (in a bus window) | on the bus (pilot bus journey) |
  | `drive` | 2 (small car, board on roof) | drive mode |
- **Facing:** left and right are mirrored frames. The sprite faces the direction of travel (bearing from `pilot`).
  Unlike today's puck, it never rotates.
- **It replaces today's position puck** while navigating. The puck's accuracy circle stays, restyled.

## Map style (real map, game-styled)
- `gameStyle(base)`: a pure function from the OpenFreeMap "liberty" style JSON to a restyled copy
  (`lib/game/map-style.ts`). It changes only paint properties, so every layer, label and source survives:
  - Land is snow white (#f4f8fb) with blue-grey hillshade.
  - Forests are deep pine (#2f5d50), water is ice blue (#9cc9e6), and buildings are warm wood (#c9a27e).
  - Roads are chunky, with a dark outline (#3b3b4f). Motorways are amber and local roads cream.
  - Labels have a dark halo for contrast.
- **Map labels keep OpenFreeMap's font (Noto).** Generating DotGothic16 glyph PBFs for the map is out of scope.
- **Icons are pixel sprites added with `map.addImage`:**
  - Resort "worlds": a mountain badge with the world number.
  - Bus stops: a little shuttle sign.
  - Konbini and food icons.
  - Saved places: a star.
  - The destination: a flag.
- **Route lines:** dotted trails, like an overworld path. The active route is a thick dashed line, and
  the alternates are thin and grey. The walk legs of a bus journey use footprint dots.
- **Navigation stays plain-readable.** Off-route and arrival states keep strong colour contrast.

## World numbers
The resorts are numbered **W1–Wn by geography, north to south** (n = resorts in the catalog: 10 today, from
W1 Cortina to W10 Jigatake), like an overworld, so a world keeps its number whatever the list is sorted by.
The order comes from `resorts.json` by northernmost access point. A test checks that the numbering is complete and stable.

## UI frames and type (v2, 2026-11-20: the Maps look)
Replaced by docs/ux/google-maps-workflows.md T1, at the owner's request: the working interface follows
Google Maps' conventions, and the game stays in the rider, the world badges, stamps and sounds.
- **Font:** the device's own sans-serif (`system-ui`, then Hiragino Sans / Noto Sans JP for Japanese
  names). Nothing to download. Was DotGothic16.
- **Surfaces:** `.surface` (white, a soft two-layer shadow) with rounded corners where it's used: the trip
  card and side card 16 px, the phone sheet's top 16 px, pin cards and toasts 12 px (exact values, not the
  `rounded-*` scale). Was the stepped pixel frame. Every other `rounded-md/lg/xl/2xl` in the app now follows
  `--radius` 0.75rem (it was 0).
- **Controls:** `--radius` 0.75rem; primary actions are blue (`--primary` #185fc6, white text 6.0:1, ≥ 4.5:1
  as text on white, muted and the page background) and
  pill-shaped; map chips (resort labels, route times) are pills with a white edge and a soft shadow.
  Every control keeps its accessible name. The user-location dot stays Maps blue.
- **Colour:** text contrast ≥ 4.5:1 and focus rings ≥ 3:1, checked by the tokens test
  (`tests/game-tokens.test.ts`). No dark mode.
- **Kept:** the rider sprite, world badges on resort chips and in the list, stamp moments. (The title screen
  was kept here until web-app v1.30 removed it.)

## Sound
> **Removed in web-app v1.14 (2026-11-10):** the app has no sound. The rest of this section is history.

- **Chiptune effects synthesised with the Web Audio API** (square and triangle oscillators, short envelopes)
  in `lib/game/sfx.ts`. There are no audio files.
  | Effect | Played when |
  |---|---|
  | `select` | tab, card or list choice |
  | `confirm` | Start, route chosen |
  | `stamp` | a stamp is earned (4-note fanfare) |
  | `quest` | a quest is completed |
  | `bus` | your bus is the next to arrive (pilot) |
  | `offRoute` | a low two-tone (pilot) |
- **Muted by default.** A visible speaker toggle is saved in localStorage (`hakuba:sound`). The AudioContext is
  created on the first unmuted user gesture, as browser autoplay rules require.
- **Sound is never the only signal:** every effect has a visible counterpart.

## Motion
- Sprite animation is 4–8 fps, and the stamp moment lasts ≤ 1.5 s. (The title screen's drifting snow went with it in web-app v1.30.)
- **`prefers-reduced-motion: reduce`:** static frames, and the stamp shows without the bounce.

## Performance budget
- Theme code (sprites, style, sfx, frames) adds ≤ 40 KB gzipped JS to the first load.
- **Sprites are drawn once** to canvases or ImageBitmaps and reused. There's no per-frame drawing while the map is idle.
- No game engine or new runtime dependency besides the font.

## Acceptance criteria
- [ ] Every sprite is valid: every row of every frame has the declared width, uses only palette indices, and matches the pose table.
- [ ] `gameStyle` keeps every layer id, source and layout property of the base style and changes only paint; the snapshot of changed properties is reviewed.
- [ ] W1–W10 are assigned north to south, every resort has exactly one, and the order is stable.
- [ ] Theme tokens meet 4.5:1 text contrast and 3:1 for focus rings (light theme; there is no dark mode yet).
- [ ] ~~Sound is off on first load…~~ Replaced by web-app v1.14: no sound, no AudioContext.
- [ ] Reduced motion: no animation frames advance, and no snow particles appear.
- [ ] Every e2e test that finds controls by role and name passes unchanged (the theme changes look, not semantics).

## Boundaries
- **Always:** keep accessible names and roles; keep exact numbers visible; credit the map data as today.
- **Ask first:** any new dependency; audio files; a game engine; changing what the planner computes.
- **Never:** copy or imitate a specific game's characters, names, sprites, music, sound effects, items or screens
  (for example creature-catching balls, warp pipes, "?" blocks, or a famous plumber's look); hide or round a real
  ETA, time or distance for style; autoplay sound.
