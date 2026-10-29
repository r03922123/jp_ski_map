# Bus stop locations

## Problem Statement
How might we give every Hakuba Valley shuttle pickup stop a location people can trust for
walking directions, without guessing and without depending on Google's own map data?

## Recommended Direction (chosen 2026-10-29)
**A — the operator's own My Maps.** The shuttle page embeds, next to every timetable, a Google
My Maps layer (`/maps/d/embed?mid=…`) of that line's stops, authored by Hakuba Valley (13 layers;
the PDF's QR codes only cover 10 of them — the page is the complete source). We use its official KML export
once per season (like the timetable images), match placemarks to our stop aliases, and run
the existing verification (timed-leg drive times, untimed neighbour distance) before
accepting a point. These are the operator's published pins, not Google basemap/place data.

**B — "your hotel is the stop".** Most Line F/G stops are hotels. When the origin came from
searching a hotel whose name matches a stop alias, that stop is walk 0 — exact without
any coordinate.

## Key Assumptions to Validate
- [ ] The My Maps layers contain point placemarks named like the timetable stops — check the KML.
- [ ] Their pins are accurate — run the timed-leg check; spot-check against the 42 already-verified stops.
- [ ] Hotel names from Photon / the lodging snapshot match stop aliases often enough — measure on the snapshot.

## MVP Scope
In: one-shot `import_mymaps` step (KML → evidence entries with source mid), verification, hotel-name
matching in the bus query. Out: UI changes beyond what the bus tab already shows.

## Not Doing (and Why)
- Harvesting coordinates from Google's base map or place pages — spec boundary; not the operator's data.
- Area-centroid guesses from the schematic map — it isn't to scale; a wrong pin is worse than none.
- Editing OpenStreetMap — worthwhile follow-up, but slow and not needed for the app.

## Outcome (2026-10-30)
98/98 stops located; median 2 m from independently verified stops. Layer KML hashes are tracked
in sources.json, so mid-season changes to a stop map are detected by the weekly watch.
