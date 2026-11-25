# ADR-0010: Drop restaurants and konbini; focus on resorts

## Status

Accepted by the owner on 2026-11-25 ("remove food and konbini related module, I want to focus on
resort and its reliability"). It retires SPEC-poi-destinations (v1, v1.1 and the v1.2 Google rating
card), which this commit deletes.

## Date

2026-11-25

## Context

The app showed restaurants and convenience stores from an OpenStreetMap snapshot (77 food, 10 konbini),
ranked by travel time, and from 2026-11-25 a Google Places UI Kit card for food with a stored Google
place ID. Three findings from that day:

- **Matching was unreliable.** Google's ID-only Text Search matched 59 of 77 food places inside a
  200 m box. Two different restaurants came back as one Google place, and the first card checked on
  production showed the wrong restaurant (Luckey Pete's Cafe and Bar got Tozai Bar & Lounge, which
  Google lists as temporarily closed). Google has no listing for Luckey Pete's at all.
- **The data was thin.** Of the named food places in OpenStreetMap, 6 of 67 have a full address, and
  our snapshot kept none. Only 28 of 77 have a cuisine and 20 have opening hours.
- **Google Maps already does this well.** A throwaway prototype with Google's own search and food
  list found Hakuba restaurants with photos and ratings at once. Showing that list on our
  OpenStreetMap base map is not allowed (Maps Service Specific Terms 15.2), and moving to a Google
  base map means rewriting about 2,000 lines of map code and paying per page view.

Skiers can open Google Maps for food. Resorts, their runs and lifts, snow, crowds and the shuttle
buses are the part no other app combines.

## Decision

Remove the restaurant and konbini module everywhere: the `/api/pois/nearby` endpoint and the
`pois` package, `poi_osm.json` and `poi_google.json`, the MCP `nearby_pois` tool and its eval
questions, POIs in place search, the Food and Konbini tabs, POIs as trip stops and saved places, and
the Google Maps JavaScript loader. Keep the OpenStreetMap base map.

## Consequences

- No Google Maps Platform call remains in the app. The owner can delete the Vercel variable
  `NEXT_PUBLIC_GOOGLE_MAPS_KEY` and disable the Google Cloud APIs and keys. Cost stays $0.
- Old links with `dest=poi:…` no longer resolve; the app ignores them instead of failing. Saved or
  shared places of kind `poi` become pins, keeping their name and position, so nothing a user saved
  is lost.
- Typing a restaurant name in search finds it only through the Photon fallback, if at all.
- The MCP eval set shrinks from 66 questions; results before and after are not directly comparable.
- Lodging (OpenStreetMap plus Overture) stays: it is where a trip starts.

## Alternatives considered

- **Name check on the Google match.** Drops wrong cards for $0, but keeps a thin list and a card for
  only 57 of 77 places.
- **Google base map.** Best food and search experience, but a large rewrite, per-view cost and
  stricter terms over the whole map.
