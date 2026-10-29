# Spec: bus-schedules

> Module of [SPEC.md](SPEC.md). Depends on: resort-catalog, routing. Consumed by: web-app (🚌 Bus tab).

## Objective
Answer the question "From my hotel, which shuttle bus do I take, when does it leave, and when do I reach each resort?" The data comes from the official Hakuba Valley shuttle page. It is turned into validated, versioned JSON with **no paid API**.

## Source facts (observed 2026-10-28)
- Page: https://www.hakubavalley.com/en/access_en/shuttlebus_en/
- The HTML lists, for each resort, the lines that serve it (e.g. Happo-One → V, H, E), plus the fare (Adult ¥800, Child ¥400, free with a HV pass) and the operating periods.
- Timetables are **JPG images per line** (`E, F, G1-6, G7-10, H, I, L, N, O, R, T, V1, V2, VN`) plus a full-season PDF (Illustrator). Each image is a two-language grid: stops are rows, trips are columns, `—` means the trip doesn't stop there, and there are separate "heading south / north" blocks.
- One line has **several periods per season** (e.g. V1 = 13–23 Dec, V2 = 16–29 Mar).

## Ingestion pipeline
1. **Detect** (`python -m hakuba_api.bus.check_sources`): fetch the page, collect the timetable/PDF asset URLs, download them to `data/bus/raw/<season>/`, and compute sha256. Compare with `data/bus/sources.json`. Print the NEW / CHANGED / REMOVED assets and exit with code 1 if anything changed. Also refresh the line↔resort mapping from the HTML.
2. **Transcribe** (manual step, in a Claude Code session, no API calls from code): for each new or changed image, write `data/bus/timetables/<season>/<line>-<period>.json` following the schema below. Use the stop names exactly as printed (EN).
3. **Validate** (`python -m hakuba_api.data.validate`):
   - every stop name resolves via `catalog.stop_by_alias`
   - within each trip, times strictly increase down the stop order
   - trip columns in a direction block keep the same stop order
   - `validFrom ≤ validTo`; periods of the same line don't overlap
   - each `sourceSha256` matches an entry in `sources.json`
4. **Review**: a human compares the image with `git diff` and commits. Unvalidated or unreviewed files are never served (`reviewed: true` is required).

## Timetable schema
```jsonc
{ "lineId": "line-v", "period": "v2", "season": "2025-26",
  "name": { "en": "Cortina ↔ Hakuba GORYU", "ja": "コルチナ ↔ 白馬五竜" },
  "validFrom": "2026-03-16", "validTo": "2026-03-29", "serviceDays": "daily",
  "fare": { "adultJpy": 800, "childJpy": 400, "hvPassFree": true },
  "source": { "url": "https://…/TimetableV2.jpg", "sourceSha256": "…" },
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
