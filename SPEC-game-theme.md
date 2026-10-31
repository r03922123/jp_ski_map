# Spec: game-theme

> Module of [SPEC.md](SPEC.md). Depends on: nothing (browser only). Consumed by: `web-app`.
> Added 2026-10-31 (v1.6). Decisions: a game skin over the real planner; the real map restyled, not
> replaced; original art and sound made in code; UI font DotGothic16 (OFL); replaces today's look (no toggle).

## Objective
Make planning a ski day feel like starting an adventure: a pixel snowboarder crossing a snowy
overworld to reach the valley's resorts. The genre is the classic top-down overworld adventure.
**Everything is original:** no character, name, sprite, sound, item or screen layout from any
existing game.

The game look never costs information. Every ETA, departure time, distance and route stays exact,
readable and screen-reader friendly. The theme is presentation only: it never changes what the planner computes.

## The hero
- **An original snowboarder:** beanie with a pom, goggles, orange jacket, teal board. The default name
  is "Rider", and players can rename it in `progression`.
- **A 24×24 pixel sprite, defined in code** as a palette plus rows of palette indices (`lib/game/sprites.ts`).
  It's drawn to a canvas at 2× or 3× with `imageSmoothingEnabled = false`.
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

## UI frames and type
- **Font:** DotGothic16 through `next/font/google`. Self-hosted at build time, so nothing loads from Google
  at runtime. The Latin subset is preloaded; Japanese glyphs load on demand by unicode-range. Body text is
  ≥ 16 px, and numbers use tabular figures where the font allows.
- **Dialog box:** a stepped pixel border (CSS box-shadow steps, no images), cream fill, dark text. It's used
  for directions, quests and stamp moments.
- **Level card:** a world badge, the resort name (EN and JA), stamp state, then the same facts as today
  (ETA, fresh snow, crowd...).
- **Buttons:** chunky, with a 2 px press-down offset. Every control keeps its current accessible name.
- **Colour:** text contrast ≥ 4.5:1 (checked by a test on the theme tokens), focus rings ≥ 3:1. The app has no dark mode today; a
  night-skiing palette comes with one (not part of v1.6).

## Sound
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
- Sprite animation is 4–8 fps, the stamp moment lasts ≤ 1.5 s, and the title screen has drifting snow.
- **`prefers-reduced-motion: reduce`:** static frames, no drifting snow, and the stamp shows without the bounce.

## Performance budget
- Theme code (sprites, style, sfx, frames) adds ≤ 40 KB gzipped JS to the first load.
- **Sprites are drawn once** to canvases or ImageBitmaps and reused. There's no per-frame drawing while the map is idle.
- No game engine or new runtime dependency besides the font.

## Acceptance criteria
- [ ] Every sprite is valid: every row of every frame has the declared width, uses only palette indices, and matches the pose table.
- [ ] `gameStyle` keeps every layer id, source and layout property of the base style and changes only paint; the snapshot of changed properties is reviewed.
- [ ] W1–W10 are assigned north to south, every resort has exactly one, and the order is stable.
- [ ] Theme tokens meet 4.5:1 text contrast and 3:1 for focus rings (light theme; there is no dark mode yet).
- [ ] Sound is off on first load; turning it on plays `select`; the choice survives a reload; no AudioContext exists before a gesture.
- [ ] Reduced motion: no animation frames advance, and no snow particles appear.
- [ ] Every e2e test that finds controls by role and name passes unchanged (the theme changes look, not semantics).

## Boundaries
- **Always:** keep accessible names and roles; keep exact numbers visible; credit the map data as today.
- **Ask first:** any dependency besides DotGothic16; audio files; a game engine; changing what the planner computes.
- **Never:** copy or imitate a specific game's characters, names, sprites, music, sound effects, items or screens
  (for example creature-catching balls, warp pipes, "?" blocks, or a famous plumber's look); hide or round a real
  ETA, time or distance for style; autoplay sound.
