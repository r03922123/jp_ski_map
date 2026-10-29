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
