# Behaviour cards

Reference observations for [rea-benchmark-workflow.md](rea-benchmark-workflow.md), stage ②. Each card is in our own words. Its evidence (recordings, frames) stays on the Mac in the git-ignored `.ux-evidence/`; no third-party screenshots go in the repo.

---

### BC-A1 Tap vs long-press on the map while a route is shown (Google Maps iOS app, 2026-11-03)

**Setup.** iPhone (iOS 27.0.1), Google Maps app, public-transport directions Hakuba Station → Hakuba Happo-One, route preview (not navigating). The user did the gestures; the Mac recorded the screen over USB: `.ux-evidence/gmaps-A1.mov`, 96 s, 1170×2532. The gestures were found by measuring frame-to-frame change (ffmpeg scene score at 10 fps), because iOS recordings don't show touches.

**Observed:**
- **Tap on empty map: nothing changes.** From 62.5 s to 75.9 s, the window that holds the user's tap, no frame changes beyond a once-a-second pulse of under 0.001 (a live indicator). The route, the From/To header and the sheet all stay as they were. The movement at 61.9–62.5 s is the camera framing the newly loaded route, before the tap.
- **Long-press at 76.0 s: a pin and a place card.**
  1. A red pin appears at the pressed point at once.
  2. Within about 0.1 s the directions sheet fades, and a new **"Dropped pin"** sheet slides up over it. That sheet shows the coordinates and **Directions / Save / Share**.
  3. The From/To header is hidden.
  4. Over about 1.5 s the camera eases to the pin and the route stops being drawn.
  5. The card then shows the coordinates as its title (DMS), a plus code, decimal lat/lng, **Directions / Share / Add label**, and "Add a missing place".
- **The trip is not edited.** At no point does the start (Hakuba Station) change. The pin becomes a *place you can act on*; "Directions" is the way to make it part of a trip.

**Also seen in the same frames** (bonus evidence for other clusters):
- *Cluster C, time zone:* the phone is in UTC+8. Every option shows **"7:21 – 7:44 PM (GMT+9)"**, with the zone written next to the times because it differs from the device's.
- *Cluster C, one time control:* a **"Leave 5:19 PM ▾"** chip sits above the options, next to "Modes" and "Least walking".
- *Clusters C and G, mode row and transit headline:* one row shows every mode's duration together: 🚗 7 min · 🏍 — · 🚌 **23 min** · 🚶 40 min. The transit headline (23 min) is door to door; its walking part appears inside the option (🚶 15).

**Inferred:**
- Google treats a tap on the map as "look", never "edit". Editing a trip needs a deliberate gesture (long-press) followed by an explicit choice (a button on the card).
- The dropped-pin card is a separate layer on top of the directions. ✕ probably returns to the route (not recorded).

**Unknown:**
- The exact moment of the tap (no touch indicator; the window is bounded by the user's report).
- What ✕ on the pin card does.
- Desktop behaviour (left-click and right-click): this needs the laptop observation (REA passive capture of the user's own Chrome).

**What we take:**
- A tap or click on empty map **never** changes an existing start, destination or stop. While a popover or suggestion list is open, the first tap only closes it (L1, R6).
- Long-press (touch) drops a pin and opens a small card with explicit actions. For a ski trip planner these are: **Start here · Go here · Add stop**. Ours lists all three because "where am I staying" is our first question, where Google offers only "Directions".
- Times outside the device's zone carry the zone: "07:21 (JST)", matching Google's "(GMT+9)".

**What we don't take:** Google's pin, colours, icons and card layout; the plus code; "Add a missing place". We use our own components and styles (SPEC-web-app v1.1 rule).

---

### BC-T1 Typing a new destination while a route is shown (Google Maps in desktop Chrome, 2026-11-04)

**Setup.** MacBook, Chrome 156 with a fresh signed-out profile, Traditional Chinese UI. Directions Hakuba → Hakuba Happo-One, driving. The user did every click and keystroke. REA `inspect_web_page` (passive: no script, no navigation, no input) recorded **only the accessibility tree** at three moments. Scripts, storage and network content were not kept. Evidence: `.ux-evidence/bc-t1/` (git-ignored); REA `ev_61e1c0d5…` (M1), `ev_8317b8a6…` and `ev_38f08a0b…` (M2), `ev_ae833c23…` (M3).

**Observed:**
- **M1, route shown.** Two stacked fields. Each is a `combobox` (popup: `grid`) wrapping an editable `textbox` (`autocomplete=list`, not read-only). Each field's accessible name is its role word plus its current value: "Starting point Hakuba …", "Destination Hakuba Happo-One …". **Both stay editable while a route is shown**; setting a start locks nothing. Next to them: *swap start and destination*, *add destination*, *close directions*. Below: a radio group of modes, each with its duration (Drive 7 min · Transit 23 min · Walk 40 min).
- **M2, typing "cortina" into the destination field.**
  - The start is unchanged and focus is in the destination field.
  - **The previous route and its durations stay on screen while typing**: nothing is cleared until a choice.
  - The combobox reports `expanded=true` with a single-select grid of 5 rows. Each row is one cell named "place + region, country" (e.g. "Cortina d'Ampezzo · Belluno, Italy"). The results were worldwide (Italy, Romania, a shop in Taipei), not biased to the start's area.
  - Leaving the window closed the list (`expanded=false` with the text kept). The first M2 capture missed the list for that reason; a polling capture caught it open.
- **M3, picking "Hakuba Cortina".**
  - The list closes and focus stays in the destination field.
  - The field now reads the place's full name and address. The start is unchanged.
  - The mode durations recompute at once: Drive 19 min · Transit 1 h 47 min · Walk 3 h 3 min, with "best mode" still selected.

**Inferred:**
- The destination is a plain editable field at all times. "Changing the destination" is just typing in it, the same gesture as setting it the first time.
- A search in one field only ever changes that field. The start field's suggestions can't touch the destination, and vice versa.
- Typing is a draft: the committed trip (route on the map) changes only on a pick.

**Unknown:**
- What Escape or blur does to a half-typed destination: does it restore the old name, or keep the draft? We saw blur keep the text; we didn't see whether the route then followed the text.
- Phone behaviour. iOS Chrome can't be attached (WebKit), and the iPhone app wasn't recorded for this card.
- Keyboard selection (arrow keys) in the grid: the tree showed no active-descendant during M2.

**What we take** (SPEC-web-app v1.8):
- An always-editable **To** combobox in drive and walk, showing the destination's name; a search in it changes only the destination (rule 1; this is what fixes T and D1).
- **Typing is a draft.** The current destination and its route stay until a suggestion is chosen. Leaving the box without choosing puts the current destination's name back, so the box never disagrees with the map.
- After a choice: the list closes, focus stays in the box, and the trip panel's times recompute.
- Each suggestion has a second line saying where or what it is. Ours already shows a detail line, and our resort index is local, so resorts rank first, which beats Google's worldwide mix for this app.

**What we don't take (now):** a swap button and "add destination" (we have Add stop) are noted for later, not v1.8. No Google wording, icons, addresses or layout.

---

### BC-L1 How much of the phone screen goes to the map (Google Maps iOS app, measured 2026-11-04)

**Setup.** Frames from the BC-A1 recording (`.ux-evidence/gmaps-A1.mov`, iPhone, 1170×2532, scaled to 390×844 for measuring; frames in `.ux-evidence/L1/`). The user drove the app; no Google page was scripted. Values are the y-coordinates of the visible edges, so they're approximate (±10 px).

**Observed:**

| State | Top card | Bottom sheet | Unobstructed map |
|---|---|---|---|
| Place card, Hakuba Station (50 s) | none | from y≈460: ≈46 % | ≈54 % |
| Route preview, public transport (70 s) | From/To stacked, y≈55–150: ≈11 % | from y≈470: ≈44 % | ≈38 % |
| Dropped pin (90 s) | none | from y≈455: ≈46 % | ≈54 % |

- The sheet's resting height is about **half the screen** in every state, the iOS sheet's medium detent. The list scrolls inside it.
- **Route preview content, top to bottom:** a title row ("Public transport", with filter, share and ✕); a row of every mode **with its duration** (🚗 7 min · 🏍 — · 🚌 23 min · 🚶 40 min); the time chips ("Leave 5:19 PM", "Modes"); then the options. There are no decorative rows.
- **From/To live in a card at the top**, with ⋯ and a swap ⇅ button. The map controls (layers, locate, a Street View thumbnail) float at the map's edges, next to the sheet.

**Inferred:**
- Google doesn't make the map dominant by area; in route preview the answer gets more room than the map. The map stays usable because the sheet holds only the answer, the fields are out of the sheet, and nothing leaves a tall sheet over the route.

**Unknown:**
- Whether choosing a different route option or destination resizes the sheet (not in the recording).
- What tapping the top card does (BC-T1 desktop: the field becomes editable in place; on iOS it may open a full-screen search).

**What we take** (SPEC-web-app v1.9):
- From/To move to a top card (this fixes T-fold).
- The sheet's peek stays at about 40 %, close to Google's ≈44 %. We fix what fills it: the answer (tabs, ETA/Start) instead of the game HUD row.
- The sheet never stays tall over the route after a choice (cluster F), and focusing a field doesn't grow it.
- Candidate for later: durations on the mode tabs, as Google's mode row has (cluster G).

**What we don't take:** Google's card styling, icons, or the Street View thumbnail.

---

### BC-L1, update 2026-11-20: L1 and the place sheet's low height, in points (Google Maps iOS app)

**Setup.** Two new recordings by the owner (`.ux-evidence/ios-layout/rec1.mp4`, 22 s, and `rec2.mp4`, 27 s;
1170×2532, so a 390×844 pt screen). rec1 is the app opened with nothing searched, plus the sheet dragged up.
rec2 is a search typed with the keyboard up, then a Hakuba guest house picked and its sheet lowered. Frames
are at 10/s in `.ux-evidence/ios-layout/rec*/`. Edges come from scanning pixel columns at x = 8, 195 and
380 pt (±3 pt). No Google page or app was scripted. Account, location and saved-place details in the frames
are not copied here.

**Observed** (pt of the whole 844 pt screen; "map" = between the bottom of the top chrome and the top of the sheet):

| State (frame) | Top chrome ends | Sheet starts | Map |
|---|---|---|---|
| L1 opened (rec1/0040) | 147: a floating search bar (55–103) and a chip row (115–147) over the map | 701 (a 53 pt peek, then a 90 pt tab bar) | 554 pt, 65.6% |
| L1, sheet dragged up (rec1/0140) | — | ≈55: the sheet covers nearly the whole screen | ≈0 |
| L3 place card, first height (rec2/0210) | 103: search bar only | 460 | 357 pt, 42.3% |
| L3 place card, lowered (rec2/0250) | 103 | 701: title row and actions only, 143 pt | 598 pt, 70.9% |

- The map runs under the status bar and the floating bars. Only the bars' own pixels hide it.
- The place sheet opens at about half the screen, like BC-L1's ≈46%. **A drag down leaves it resting at a
  low height** that keeps the place's name and its three actions (Directions, Availability, Call), and the
  map gets 71% of the screen.
- L2 (keyboard up) fills the screen with suggestions and the keyboard; no map shows.

**Ours at the same size** (`LAYOUT_VIEWPORT=390x797 pnpm e2e e2e/layout-share.spec.ts`: the home-screen
app's page under a 47 pt status bar; Chromium emulation, not yet a real iPhone):

| State | Top chrome ends | Sheet starts | Map |
|---|---|---|---|
| L1 opened, no start | 47 + 68 = 115 | none (hidden until a start is set) | 728 pt, 86.2% |
| L1b start set, ranked list (nearest to Google's L3) | 47 + 120 = 167 | 498 | 331 pt, 39.2% |
| L4 directions preview | 47 + 172 = 219 | 498 | 279 pt, 33.0% (Google ≈320 pt, BC-L1) |

**Inferred:**
- Google's sheet has three resting heights (low, half, full). Ours has two: 40% and expanded. So with a
  place or trip open, our map can never get past about 40% of the screen, where Google's reaches 71%.
- In directions preview, our sheet is about as tall as Google's. The 41 pt we lose is in the top card
  (172 pt vs Google's ≈95 pt), which has a third row for "Add destination" and the star.
- With nothing open, ours already shows more map than Google, which spends ≈90 pt on chips and ≈90 pt on a tab bar.

**Unknown:** the low height's exact behaviour on a fling vs a slow drag; our numbers on the real iPhone (Safari
tab and home-screen app).

**What we take:** a low resting height for the sheet that keeps only the answer row (title or ETA and its main
action), reached by dragging down; and a shorter trip card.
**What we don't take:** Google's chips, tab bar, Street View thumbnail, colours and card styling.

---

### BC-L2 The side panel on a laptop (Google Maps in desktop Chrome, 2026-11-20)

**Setup.** The owner's Chrome, 1440×722 viewport, signed in (so no screenshot is kept: it showed saved
places). The agent opened directions Hakuba Station → Happo-One with the owner's go-ahead and read element
boxes from the page's DOM (`aria-label`s and `getBoundingClientRect`), plus two screenshots it looked at and
did not save. No script source, network or storage was read.

**Observed** (CSS px):

| State | Panel | Map |
|---|---|---|
| Opened, nothing searched | none: a floating search box (x 88–464, y 12, 48 tall) and a row of category chips beside it, right of a 72 px icon rail | the whole window behind them |
| Directions preview | a card at x 72, y 8, 408 × 706 (the window's height less 8 px above and below) | the route framed to the right of the card |
| After "Collapse side panel" | gone, the icon rail too; an "Expand side panel" tab, 23 × 48, at x 0, centred vertically | **unchanged**: the camera doesn't move, the route stays where it was |

- The collapse tab is 23 × 48 on the card's right edge, centred vertically (y 337–385 of 722).
- The mode row at the top of the card shows each mode's duration (🚗 7 min · 🚌 40 min · 🚶 40 min).
- Zoom and locate buttons are 29 px, bottom right; the layers tile is bottom left.

**Inferred:** the panel is a fixed-width column, so a wider window gives every extra pixel to the map; the
collapse tab is the one control that hands the whole window to the map while a trip is open.

**Unknown:** whether a new search or destination reopens a collapsed panel (searching needs the panel, so the
question only arises from the map); keyboard focus after collapsing.

**What we take** (SPEC-web-app v1.23): a collapse tab on the side card's right edge from `md` up; collapsing
slides the card out, leaves an expand tab at the window's left edge, and doesn't move the camera.
**What we don't take:** the icon rail, the category chips, Google's icons and styling. Durations on the mode
tabs stay a candidate (cluster G, BC-L1).
