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
