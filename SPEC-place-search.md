# Spec: place-search

> Module of [SPEC.md](SPEC.md). Depends on: — . Consumed by: web-app.

## Objective
Let the user find their hotel (or any place) in Hakuba and turn it into an origin coordinate, the way the Google Maps search box works.

## Coverage findings (2026-10-28 spot check, 10 well-known hotels)
- 4/10 found by English name in OSM/Photon (Hotel Hakuba, Mominoki, Sierra Resort, Penke Panke).
- 2/10 are in OSM **only under their Japanese name** (白馬東急ホテル, 白馬ハイランドホテル), so English search misses them.
- 4/10 are missing from OSM (Courtyard by Marriott, Hakuba Springs, Phoenix, Morino Lodge).
- Both public Overpass instances returned "at capacity" errors, so live Overpass is unreliable.

**Decision (2026-10-28):** stay on OSM (free, no ToS conflict with MapLibre). There is **no curated lodging list**; hotels missing from OSM are reached by pasting a Google Maps link or dropping a pin. Google Places is rejected for v1: it needs billing and an API key, its terms require a Google base map, and it limits caching.

## Input paths
1. **Photon** (`https://photon.komoot.io/api/`) with the location bias set to Hakuba (36.70, 137.86). Results outside the Hakuba bounding box are ranked last.
2. **Pasted Google Maps link**: if the query looks like a Google Maps URL, extract the coordinates from `@lat,lng`, `!3d<lat>!4d<lng>` or `?q=lat,lng`, without calling any Google API. Short links (`maps.app.goo.gl`) are resolved with **one HEAD request to follow the redirect**, and the coordinates are then read from the final URL. The place name is read from the `/place/<name>/` path segment when present.
3. **Map click / long-press** sets a pin (handled in web-app; listed here for completeness).

## Lodging pins
- `data/lodging_osm.json`: a snapshot of Overpass lodging (`tourism~"hotel|guest_house|hostel|apartment|chalet"`, Hakuba bbox), refreshed with `python -m hakuba_api.places.refresh_lodging` (with retry/backoff, run manually or weekly). It is **never queried live at request time.**
- `GET /api/places/lodging?bbox=…` serves the snapshot.

## Interface
- `GET /api/places/search?q=<text>&limit=10` → `Place[]`
- `GET /api/places/lodging?bbox=<s,w,n,e>` → `Place[]`
```jsonc
{ "id": "osm:node/123456 | gmaps-link | pin",
  "name": "Hakuba Tokyu Hotel", "nameJa": "白馬東急ホテル",
  "kind": "hotel|guest_house|hostel|apartment|other",
  "coord": { "lat": 36.7, "lng": 137.85 }, "address": "…",
  "source": "photon|osm-snapshot|gmaps-link" }
```

## Acceptance Criteria
- [ ] The OSM-mapped spot-check hotels are found: the 4 English-named ones by English query, and 白馬東急ホテル / 白馬ハイランドホテル by Japanese query (top 3 results).
- [ ] The 4 spot-check hotels missing from OSM (Courtyard, Hakuba Springs, Phoenix, Morino) can all be set as the origin by pasting their Google Maps link.
- [ ] When a text search has no results, the UI suggests "Paste a Google Maps link or tap the map".
- [ ] Pasting a full Google Maps place URL gives coordinates within 50 m and the place name. Pasting a `maps.app.goo.gl` short link works (live test). URL parsing has unit tests for the 3 coordinate formats.
- [ ] The lodging snapshot has ≥ 20 POIs in the Happo/Echoland bbox. Snapshot refresh survives a 502 using backoff.
- [ ] Empty query → 422. Photon down → 502 `{error, source}`, while link-paste and pin keep working.
- [ ] Contract tests run against recorded fixtures, without network.

## Boundaries
- Always: send a descriptive `User-Agent`, debounce on the client (≥ 300 ms), and cache Photon for 24 h.
- Never: call any Google API, or scrape Google Maps pages. Link parsing reads only the URL the user pasted, plus at most one redirect hop for short links.
- Ask first: adding a keyed or paid geocoder, or a curated lodging list.

## Open Questions
- Contribute the missing hotels and `name:en` tags back to OpenStreetMap? This is optional and benefits everyone, but it's a manual job for the author.

## v1.2 — Google-style suggestions (approved 2026-10-30)
**Problem:** Photon alone misses hotels, knows no Japanese for most, returns far-away places, and is slow (~300 ms per keystroke). Google feels good because suggestions are instant, local, forgiving and ranked.

**Design: a local index first, Photon as fallback.**
- `places/index.py` builds, at startup, one in-memory index from data we already hold: bus stops (EN/JA + aliases), resorts and their base areas (EN/JA), the lodging snapshot (EN + JA, the refresh now keeps `name:ja`), and the POI snapshot (EN/JA, brand). ~350 entries; no network.
- Matching (pure, unit-tested): query and names are NFKC-normalised and case-folded; katakana is folded to hiragana so 「ホテル」 and 「ほてる」 match. Score: exact 100 › name-prefix 90 › token-prefix 80 › substring 70 › fuzzy (≤ 2 edits on a token, query ≥ 4 chars) 40–60. Tie-break by straight-line distance to `near` (the map centre), then kind (resort, stop, lodging, food, convenience).
- `GET /api/places/suggest?q=…&near=lat,lng&limit=8` → `Suggestion[]`: `Place` fields plus `nameJa`, `kind` extended with `resort | stop | food | convenience`, `detail` (e.g. "Bus stop · Line V", "Hotel", "Konbini · 7-Eleven"), `match: [start, end]` on `name` for highlighting, `source: "index" | "photon" | "gmaps-link"`.
- A Google Maps URL is still handled first (unchanged). Otherwise: local hits; if fewer than 3 and the query has ≥ 3 characters, Photon results (Hakuba-biased, outside-Hakuba dropped) are appended, de-duplicated against local hits by proximity (< 50 m). A Photon failure never fails the request.
- Web `SearchBox`: suggestions update per keystroke (150 ms debounce — local is cheap); each row shows an icon by kind (🏨 🚏 ⛷ 🍜 🏪 📍), the name with the matched part bold, and `detail`; Enter picks the top row; arrow keys move; an empty focused box shows up to 5 recent picks (`localStorage`, per-viewer convenience). The map centre is sent as `near`.

**Acceptance:**
- [ ] Index unit tests: "tokyu" → Hakuba Tokyu Hotel (stop + lodging) first; 「白馬東急」 → the same; "happo bus" → Happo Bus Terminal; "7-eleven" → konbini; "hakuba" ranks the nearest entries first for a given `near`; "hotl hakuba" (typo) still finds Hotel Hakuba.
- [ ] `/suggest` returns within 20 ms for local hits (no Photon call when ≥ 3 local hits — asserted with respx).
- [ ] Photon down → local results still returned, 200.
- [ ] Web: typing "tok" shows a bolded "Tok" in "Hakuba Tokyu Hotel"; Enter selects it; recents appear on focus; E2E: search "Tokyu" → origin set at the hotel, lodging pins visible (existing spec adapted).
- [ ] Mobile: dropdown fits 390 px with no horizontal scroll.

**Not doing:** Google Places (needs billing, Google basemap, caching limits); server-side query logging.
