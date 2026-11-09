# Spec: bus-schedules

> Module of [SPEC.md](SPEC.md). Depends on: resort-catalog, routing. Consumed by: web-app (🚌 Bus tab).

## Objective
Answer the question "From my hotel, which shuttle bus do I take, when does it leave, and when do I reach each resort?" The data comes from the official Hakuba Valley shuttle page. It is turned into validated, versioned JSON with **no paid API**.

## Source facts (observed 2026-10-28)
- Page: https://www.hakubavalley.com/en/access_en/shuttlebus_en/
- The HTML lists, for each resort, the lines that serve it (e.g. Happo-One → V, H, E), plus the fare (Adult ¥800, Child ¥400, free with a HV pass) and the operating periods.
- Timetables are **JPG images per line** (`E, F, G1-6, G7-10, H, I, L, N, O, R, T, V1, V2, VN`) plus a full-season PDF (Illustrator). Each image is a two-language grid: stops are rows, trips are columns, `—` means the trip doesn't stop there, and there are separate "heading south / north" blocks.
- One line has **several periods per season** (e.g. V1 = 13–23 Dec, V2 = 16–29 Mar).

**Finding (2026-10-30):** the page shows only the *latest* image per line. For Line V2 (Cortina ↔ Goryu) that is the Mar 16–29 revision; the main-season V2 timetable (Dec 13–Mar 15, 28 trips a day, four operating periods marked ●/★ and a 22-1/22-2 variant) exists only in the season poster PDF `2025-2026-Shuttle-Bus-Timetable.pdf`. It was transcribed from the PDF into `line-v-v2-p{1,2,3}.json` (the ★ columns were cross-checked against the reviewed Mar 16–29 file). **Rule:** when a line's image carries a period that doesn't start at the season start, check the PDF for the earlier periods.

## Ingestion pipeline
1. **Detect** (`python -m hakuba_api.bus.check_sources`): fetch the page, collect the timetable/PDF asset URLs, download them to `data/bus/raw/<season>/`, and compute sha256. Compare with `data/bus/sources.json`. Print the NEW / CHANGED / REMOVED assets and exit with code 1 if anything changed. Also refresh the line↔resort mapping from the HTML.
2. **Transcribe** (manual step, in a Claude Code session, no API calls from code): for each new or changed image, write `data/bus/timetables/<season>/<line>-<period>.json` following the schema below. Use the stop names exactly as printed (EN).
3. **Validate** (`python -m hakuba_api.data.validate`):
   - every stop name resolves via `catalog.stop_by_alias`
   - within each trip, times never decrease down the stop order (equal minutes are allowed: E2 prints 8:00 at two consecutive stops)
   - trip columns in a direction block keep the same stop order
   - `validFrom ≤ validTo`; periods of the same line don't overlap
   - each `sourceSha256` matches an entry in `sources.json`
4. **Review**: a human compares the image with `git diff` and commits. Unvalidated or unreviewed files are never served (`reviewed: true` is required).

## Transcription findings (2026-10-29)
- Lines F and G publish **only the first stop's departure** ("wait at each bus stop based on the scheduled departure time"; "the order of stops may vary"). Their other stops are `null`.
- Sub-routes (E1–E4, G1–G10, …) are separate `routeId`s under one `lineId`; the overlap check is per `routeId`.
- 118 printed stop names map to 98 physical stops (`data/bus_stops.json`). 32 have checked coordinates (resort access points, OSM bus stops, the lodging snapshot, or Photon matched by Japanese name); 66 are `coord: null` / `coordSource: "unresolved"` rather than guessed.

## Stop location preprocessing (decided 2026-10-29)
`python -m hakuba_api.bus.locate_stops [--write]`. Evidence is researched by hand (web search by Japanese stop name) and committed in `data/bus/stop_evidence.json`: a street address plus source URL, or an OSM point. The script:
1. geocodes addresses with GSI (国土地理院) and accepts only lot-number (番地) matches;
2. rejects GSI points returned for several different lots (GSI uses one representative point for many rural lots);
3. requires each GSI point to be within 1 km of a trusted stop (resort access point, OSM bus stop, lodging snapshot) on one of its routes;
4. checks every timed leg: Valhalla's drive time must be ≤ scheduled gap × 1.5 + 3 min. Untimed pickup neighbours must be ≤ 8 km apart, except on the final leg to the resort.
Stops that fail stay `coord: null` with the reason in `coordSource`.

**Operator My Maps (decided 2026-10-29, see docs/ideas/bus-stop-locations.md).** The shuttle page embeds, next to every timetable image, a Google My Maps layer of that line's stops authored by Hakuba Valley (13 layers; lazy `<iframe data-src>`). `check_sources` discovers them with the timetable they belong to, saves their KML exports and tracks their sha256 in `data/bus/sources.json` (`myMaps`), so a moved stop is detected like a changed timetable. (First found via the PDF's QR codes, which only cover 10 lines; the page is the complete source.) `python -m hakuba_api.bus.import_mymaps [--write]` matches their KML placemarks to stops (EN/JA names plus a hand-checked table), refuses to import if they disagree with already-verified stops (median 48 m), merges a stop's pins by median, out-voting a minority of misplaced pins (two-thirds majority within 100 m; e.g. G1-6 reuses the Alpine Chalets pin for La Vigne) and skipping stops with no majority, then adds the rest to the evidence file, after which `locate_stops` runs the usual checks. These are the operator's own pins, not Google basemap or place data. Result 2026-10-30: **98/98 stops located**, median 2 m from independently verified stops. Whether the pins may be reused is still unresolved, so [ADR-0002](docs/adr/0002-data-files-odbl.md) names them as a licence exception and [DATA-LICENSES.md](DATA-LICENSES.md) covers the stops that still use them as one group: those whose `coordSource` starts with `operator My Maps pin`.

**Your hotel is the stop.** `/api/bus/options?name=<searched place>`: a stop whose English or Japanese name is the same property (generic place words ignored; type words like Hotel/Lodge may be dropped only when one side's are a subset of the other's) counts as walk 0, even without coordinates. 10 of the 146 snapshot hotels match, with no lookalikes.

## Untimed routes (decided 2026-10-29)
Lines F/G (and N's return) publish only first-stop departures. The bus query lists them as **"Departs <first stop> HH:MM → <resort> (stop times not published)"** when the user's walkable stop is on the route, ranked after fully timed options.

## Timetable schema
```jsonc
{ "lineId": "line-v", "routeId": "v2", "season": "2025-26", "kind": "day",
  "name": { "en": "Cortina ↔ Hakuba GORYU", "ja": "コルチナ ↔ 白馬五竜" },
  "validFrom": "2026-03-16", "validTo": "2026-03-29", "serviceDays": "daily",
  "fare": { "adultJpy": 800, "childJpy": 400, "hvPassFree": true },
  "source": { "file": "TimetableV2.jpg" },   // must be an asset in sources.json
  "reviewed": true,
  "directions": [
    { "id": "south", "stops": ["Hakuba Cortina Snow Resort", "Satomi", "…"],
      "trips": [ { "n": 1, "times": [null, null, null, "07:48", "…"] } ] } ] }
```

## Query
`GET /api/bus/options?from=lat,lng&at=<ISO datetime>` → `BusOption[]` grouped by resort
1. Candidate stops = stops whose Valhalla **walking** time from the origin is ≤ 20 min (matrix call; fall back to the 3 nearest by straight-line distance if there are none).
2. Active timetables = periods where `validFrom ≤ date ≤ validTo`.
3. For each candidate stop and each trip departing at or after `at + walkS`, list the later stops on the same trip whose stop `servesResortId` is set. That gives the arrival per resort.
4. Per resort, keep the 3 earliest arrivals, sorted by arrival. Each item has `walkS, boardStopId, lineId, departsAt, arrivesAt, rideS, waitS`.
5. **Night bus (Line VN)** is transcribed too, but it is marked `"kind": "night"` and is never used for resort options. It is served separately via `GET /api/bus/night?from=lat,lng&at=…` (nearest stop → next departures, decided 2026-10-28).
6. v1 = **direct trips only, no transfers.** If there are no active periods → `{ "status": "no_service", "nextServiceDate": … }`.

## Acceptance Criteria
- [ ] `check_sources` detects a changed image (fixture with a modified hash) and exits with code 1. On a no-change run it exits with code 0.
- [ ] All lines in the current season are transcribed, validated and reviewed, including the V2 image already seen (Cortina 9:00 → Goryu Escal Plaza 10:23 southbound).
- [ ] Validator unit tests: unknown stop, non-increasing times, and overlapping periods each fail with a clear message.
- [ ] Query unit test (fixture V2, 2026-03-20 08:00, origin at the Happo Bus Terminal): the first option to Hakuba47 is trip 1 southbound, departing 08:11 and arriving 08:39. The next one is trip 2, departing 09:48 and arriving 10:16.
- [ ] Out-of-season date → `no_service`, which the UI shows clearly.

## Boundaries
- Always: link the original timetable image in the UI ("Source: Hakuba Valley"), and show "timetable may change without notice; buses can be full".
- Never: call the Claude API or any paid OCR from code. Never serve `reviewed: false` data.
- Ask first: adding a local OCR/vision model (e.g. PaddleOCR) as a draft generator. It is a possible later addition.

## Open Questions
- Transfers (e.g. Line H → Line V): v2.
- Is the full-season PDF a better single source than the per-line JPGs? It has fonts, so it may have extractable text. Check this during the first transcription.

## v1.1 — Season-agnostic schedules and "expected" times (approved scope 2026-10-30)
**Problem:** the data is in `2025-26/`, and today (2026-10-30) every query says `no_service`. The UI also mentions seasons and years the user doesn't care about.

**Projection rule (pure function `effective_timetables(day, timetables)`), decided per route after the 2026-10-30 adversarial review:**
1. For each route, if a reviewed timetable has `validFrom ≤ day ≤ validTo` → use it (published).
2. Otherwise take that route's latest transcribed season and shift its periods forward by whole years (never backwards; Feb 29 → Feb 28) until one covers `day` → use it (projected). A route whose latest season is more than one season behind the newest reviewed season is treated as dropped and is not projected.
3. `basis` is `"published"` only when nothing was projected; `"expected"` as soon as any line is a projection (while the new season is being transcribed line by line, the rest keeps coming from last season).
4. Nothing usable → `no_service`. `nextServiceDate` is the next published start, else the next projected one, and `basis` says which. Projection wins over `awaiting_review`: an unreviewed file never blocks serving last season's times.
- `BusResult` and `NightResult` (the night endpoint now returns `{basis, basedOnSeason, newerSourcePending, departures}`) carry:
  - `basis: "published" | "expected"`
  - `basedOnSeason: string | null` (e.g. `"2025-26"`; for the source link and tooltip only, never in headline text)
  - `newerSourcePending: boolean`: the operator's page names a season newer than the latest **reviewed** one, and we are projecting. It is false whenever the requested day is fully published.
- `Timetable.season` is validated as `YYYY-YY` with consecutive years, so seasons sort chronologically as strings.
- Times stay plain clock times. A projected `departsAt`/`arrivesAt` is built on the requested date, just like a published one.
- Known trade-offs: a projection carries last season's mid-season revisions (e.g. the V1→V2 split in March) as if they repeat; projected start dates ignore weekday drift (Sat Dec 13 → Sun Dec 13), which the "Expected" caveat covers.

**UI copy (no years anywhere in the panel):**
- `published`: "Scheduled times" plus the standing "may change without notice; buses can be full".
- `expected` without a newer source: an **"Expected"** badge plus "Based on last season's timetable. The operator hasn't published this season's yet, so check before you go."
- `expected` with `newerSourcePending`: the badge plus "Based on last season's timetable. A newer timetable is out and will be added soon, so check before you go." (one notice, never two contradicting ones).
- `no_service`: "No shuttle service on this date — next from Dec 13." (no year) plus, when that date is projected, "That date is expected from last season's timetable."
- `ok` with no departures left: "No more departures after this time today."

**Regular refresh of the operator page:**
- `timetable-watch.yml` cron:
  - **daily** 09:00 JST from October to January (`0 0 * 10-12,1 *`), when the new season is published and revised;
  - **weekly** on Mondays the rest of the year (`0 0 * 2-9 1`).
- `check_sources` already detects new/changed/removed timetable images and the 13 stop-map KMLs. It now also prints `NEW SEASON <S>` when the page's season PDF is newer than the transcribed season, and the issue title then becomes "New shuttle season <S> published".
- The issue body is a checklist for a Claude Code session (no API budget): the changed files with links, `transcribe → validate → review → check_sources --accept → import_mymaps → locate_stops`.
- `data.validate` checks that the manifest season is ≥ the latest transcribed season.
- This needs the repo pushed to GitHub. Until then the same check runs locally with `uv run … check_sources`.

**Acceptance:**
- [ ] Projection unit tests: 2026-03-20 → published (2025-26). 2027-01-15 → expected, built from the 2025-26 periods shifted +1 year. 2026-07-01 → `no_service` with `nextServiceDate` 2026-12-13 (the earliest line, projected). Feb 29 handling.
- [ ] A query on 2027-01-15 08:00 at the Happo Bus Terminal returns the same trip times as 2026-01-15, with `basis = "expected"`.
- [ ] With one 2026-27 line reviewed, 2027-01-15 still serves every other line from 2025-26 (`expected`); a line absent for two seasons is not projected.
- [ ] Unreviewed 2026-27 files: still projected from 2025-26 and `newerSourcePending` is true. Night bus carries the same fields.
- [ ] `check_sources` against a page fixture naming `2026-2027-Shuttle-Bus-Timetable.pdf` prints `NEW SEASON 2026-27` and exits with code 1.
- [ ] The workflow YAML has both crons, and `actionlint` (if available) is clean.
- [ ] No 4-digit year is rendered in the bus panel (component test greps the rendered text).

## v1.1 — Bus journey on the map
- `BusOption` gains `rideStops: [{stopId, name, coord|null, time|null}]`: board stop → … → alight stop, in trip order.
- The UI draws a Google-transit-style journey:
  - a dotted walk to the board stop;
  - a ride leg in the line colour (`POST /api/route/path`, drive costing through the located ride stops);
  - small stop dots;
  - the resort marker.
- The panel timeline: `🚶 4 min → 🚏 Happo Bus Terminal 08:11 → 🚌 Line V · 5 stops · 28 min → ⛷ Hakuba47 08:39`.
- The ride-leg geometry is approximate: buses take the roads Valhalla picks between the stops, so the map label says "approximate bus path".

## v1.2: Direct shuttles to a place (way back to the lodging, approved 2026-11-09)
**Objective.** From a resort: "which shuttle takes me back to my lodging, and how far do I walk from the stop?" Measured on the real timetables (752 pairs of a resort and a non-resort stop more than 1.4 km from it, 20 Jan, 15:30, walks estimated in a straight line): 552 have only timed trips, 104 a mix of timed and first-stop-only trips, 4 only first-stop-only trips, 92 no direct trip left.

**API.** `GET /api/bus/to-place?from=lat,lng&to=lat,lng&at=&name=&toName=` → `PlaceBusResult`: `status`, `nextServiceDate`, `basis`, `basedOnSeason`, `newerSourcePending` (same meaning and same season rules as `/options`) and `options: BusOption[]`. `BusOption.resortId` becomes nullable (null here), and it gains `walkToPlaceS` and `doorArrivesAt` (null when untimed).

**Walks.** Both ends use the `/options` rule: stops within 20 min on foot, else the 3 nearest. `toName` makes a stop that *is* the lodging walk 0, like `name` does for the start.

**A `null` time means two things.** A trip is *first-stop-only* when exactly one of its times is published (F, G, N's return): there, `null` means "not published". On every other trip (V2, O, I3, L), `null` means the bus does not go there: V2 north trip 7 skips JR Hakuba.
- **Board** only at a stop with a published time, and only if you can walk there before it leaves.
- **Get off** at a later stop on the same trip, other than the boarding stop. On a timed trip that stop must have a published time; on a first-stop-only trip any later stop counts, unless the trip's `skips` lists it.
- Direct trips only, `kind: day` only.
- `rideStops` leaves out the stops a timed trip skips, so the map and the stop count match the bus. A first-stop-only trip keeps all its stops except those in `skips`.

**Choosing the stop (one row per trip).** Timed trip: the stop that gets you to the door soonest (alighting time + walk), then the shorter walk to the place, then the shorter walk to the boarding stop. First-stop-only trip: the shortest walk from the stop.

**Order.** Up to 5 rows, by departure from the boarding stop, then door arrival (timed before first-stop-only), then total walk. Departure is the one time both kinds of trip have; the outbound rule (timed first, three rows) would push an earlier F/G bus off the list in 71 of the 104 mixed pairs above.

**One row per departure of first-stop-only buses.** Several G routes leave the same stop at the same minute, each to different hotels, and could fill every row and hide later timed buses (from Goryu Escal to JR Hakuba at 14:30, all five rows left at 15:00). So first-stop-only trips keep one row per boarding stop and departure minute: the shortest walk from the stop. Timed trips are never thinned, because their different arrivals are a real choice.

**First-stop-only rows.** "Departs <first stop> HH:MM · stop times not published", with `arrivesAt` and `doorArrivesAt` null. We never estimate an arrival. The operator also says the order of stops may vary, so the row names the stop and the walk and says so.

**Known gaps.**
- N's outward trip publishes no arrival at Norikura, so it is not offered as a way to reach a lodging there; V2 covers that area.
- H3 outward trip 1 prints 9:53 at Sakka Slope, out of sequence, so the file stores `null` and that bus isn't offered to Sakka; the next one is.

**Boarding rules.** A direction may carry, as indexes into `stops` (a loop lists some stops twice):
- `boardOnly`, `alightOnly`: the stop can only be used that way (H1/H2's ▲ stops, Gurutto's ●/▲ stops).
- `restricted: [{stop, onlyWith}]`: a ride using `stop` must have `onlyWith` at its other end (E2's starred Courtyard and Oak Forest are only for Iwatake travellers).

A trip may carry `skips`: indexes where it prints "—" although it is first-stop-only (F6 outward trip 3).

On the free shuttles, `/to-place` boards only at a stop that serves a resort, because the poster limits them to trips between a resort and your lodging ("basically", printed under "Free shuttle bus to the ski resort"). Paid line V has no such limit, so V1's 17:30 from the Happo Bus Terminal, which serves no resort, is offered.

The poster's legend says ● is alighting and ▲ boarding. Read that way nobody could board Gurutto at its first stops or leave at its last, and H's ▲ marks sit only at the ends of the loops, so we treat ● as boarding and ▲ as alighting.

**Acceptance** (on the real files):
- [ ] E2: Iwatake → Courtyard is offered; Happo Nakiyama → Courtyard is not.
- [ ] H1: boarding at the final Mount (08:25) is not offered; getting off there is.
- [ ] Gurutto: Iwatake → Omachi Onsenkyo Ent. is offered; Iwatake → Escal Plaza is not.
- [ ] F6: a ride to Keyakino-ki on outward trip 3 is not offered, and the stop isn't in the ride.
- [ ] A free-shuttle row can't board at a stop that serves no resort; a line V row can.
- [ ] The validator rejects an out-of-range index, and a stop that is both `boardOnly` and `alightOnly`.

**Acceptance** (pure function, V2 Mar 16–29 + G4, 2026-03-20 14:30, walk 2 min to `stop-goryu-escal-plaza`, 5 min from `stop-happo-bus-terminal`):
- [ ] Five rows in order: V2 14:37 → 15:10 (door 15:15); G4 15:00, untimed, door null; G4 16:00, untimed; V2 16:07 → 16:40 (door 16:45); G4 17:10, untimed.
- [ ] With only `stop-jr-hakuba` near the place, V2 north trip 7 is not offered and trip 8 is.
- [ ] A first-stop-only trip can't be boarded at a later stop.
- [ ] A stop can't be both boarding and alighting; a loop line works; one row per trip; at most 5.
- [ ] First-stop-only buses leaving one stop at the same minute share one row, the shortest walk from the stop, chosen before the cut to five; timed buses and other boarding stops keep their rows.
- [ ] Out of season and unreviewed answers match `/options`.

**Out of scope:** transfers, and changing the `/options` query, which still treats every `null` as "not published" and ignores the boarding rules.
