# ADR-0002: Bus-stop, resort and stop-evidence data are ODbL as whole files

## Status

Accepted (2026-11-06). Replaces the labelling part of [ADR-0001](0001-follow-ups-1-2-3-5.md)
Decision 1.

## Date

2026-11-06

## Context

ADR-0001 Decision 1 said: label the 27 OpenStreetMap-derived stops in `data/bus_stops.json` ODbL
with the OSM credit, give the 2 GSI stops GSI's credit, and replace the 56 Google My Maps pins
later. Its Next step 1 asked that PR to check both against the official terms first. The check found
four things the decision didn't know, all checked against `main` at `f3c039a`. This is a reading of
licence text, not legal advice.

1. **40 stops are OSM-derived, not 27.** The 13 "resort access point" stops copy their coordinates
   from `data/resorts.json`, and all 12 access points there have a `coordSource` of `osm:way/…`
   (lift terminals). So `resorts.json` holds OSM coordinates too, yet
   [DATA-LICENSES.md](../../DATA-LICENSES.md) line 13 called it "Compiled by hand".
   `data/bus/stop_evidence.json`, the stop locator's input, holds 8 OSM points and the same 56 My
   Maps pins, and DATA-LICENSES.md didn't list it.
2. **One field mixes OSM and non-OSM values, so the file isn't a Collective Database.**
   [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) §1 defines a Collective Database as
   the database in unmodified form beside independent databases. The OSMF's
   [Collective Database Guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Collective_Database_Guideline_Guideline)
   (endorsed 2016-06-17) treats OSM and non-OSM data as independent only when a data type is
   "either all OSM or all non-OSM within the same regional cut". Its third example, a private list
   topped up with OSM data, falls outside it. In `bus_stops.json` the `coord` field is 40 OSM, 56 My
   Maps, 2 GSI and 2 empty. So if the OSM part is Substantial, the whole file is a Derivative
   Database (ODbL §1 and §4.4.b), and share-alike (§4.4) covers every row.
3. **Whether it is Substantial has two readings.**
   - A, the [Substantial Guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Substantial_-_Guideline)
     (2014-06-06): under 100 features is insubstantial only for a one-off extraction, and repeated
     small extractions for one project count as one. This project also took 146 lodging places and
     87 POIs from OSM ([ARCHITECTURE.md](../ARCHITECTURE.md) §5). So the guideline's safe harbour
     doesn't clearly cover the bus stops: treat them as Substantial.
   - B, the [Geocoding Guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Geocoding_-_Guideline)
     (2017-08-24): a collection of search results holding only names and coordinates, and not a
     systematic grab, is insubstantial. It triggers no share-alike and needs no credit attached to
     the data. The 7 Photon rows fit; the hand-picked OSM points, snapshot rows and lift terminals
     fit less clearly. So: no ODbL needed.
4. **The "GSI" coordinates come from a third party.** The stop locator calls GSI's address search
   (`services/api/src/hakuba_api/bus/locate_stops.py:27`). GSI's FAQ
   ([gsi-cyberjapan/gsimaps#29](https://github.com/gsi-cyberjapan/gsimaps/issues/29)) says that
   endpoint is meant mainly for GSI's own map, may change without notice, and answers address
   queries with CSIS Simple Geocoding (University of Tokyo). GSI's
   [content terms](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html) §2 leave
   third-party content to its owner. The
   [CSIS terms](https://geocode.csis.u-tokyo.ac.jp/home/simple-geocoding/simple-geocoding-tems-of-use/)
   count indirect callers as users (第1条(3)) and ask for a CSIS credit on the map or in the app
   (第4条(1) and (4)).

## Decision

### 1. Three data files are ODbL 1.0 as whole files

`data/bus_stops.json`, `data/resorts.json` and `data/bus/stop_evidence.json` are under ODbL 1.0,
credited "© OpenStreetMap contributors". This holds under both readings: under A it is required,
and under B it costs nothing, because the repository is already public.

### 2. Two named exceptions until ADR-0001 step 2 replaces them

- **The 56 Google My Maps pins** in `bus_stops.json`, and the same 56 entries in
  `stop_evidence.json`. Their licence is unresolved, and ODbL §4.4.d forbids adding content to a
  Derivative Database that is incompatible with the licence, so the ODbL label can't cover them.
- **The 2 GSI stops** in `bus_stops.json`. Step 2 re-locates them from OSM instead of adding a CSIS
  credit to the app. Until then, DATA-LICENSES.md names their source.

### 3. The notice lives in DATA-LICENSES.md

`bus_stops.json` and `resorts.json` are bare JSON arrays with no field for a notice. ODbL §4.2.d
then allows the notice where users would look, and the OSMF
[Attribution Guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)
("Databases") name a readme as such a place. DATA-LICENSES.md is linked from
[README.md](../../README.md) line 78. `stop_evidence.json` has a `_doc` field that could hold the
notice; this PR changes no data, so step 2, which edits that file anyway, adds it there.

## Alternatives Considered

### Per-row labels (ADR-0001 Decision 1)

- Not enough under reading A: one mixed field makes the whole file a Derivative Database.

### Reading B: no ODbL label

- Only the 7 Photon rows clearly fit the Geocoding Guideline; resting the other 33 on it is a guess.

### A CSIS credit in the app for the 2 GSI stops

- A UI change, and it keeps the data tied to an endpoint GSI says may change without notice.

## Consequences

- DATA-LICENSES.md now says where the coordinates came from, with the two exceptions named.
- **ODbL §4.6:** whoever publicly uses a Derivative Database must offer it in machine-readable form.
  The public repository does that today. If it ever goes private, the three files must still be
  offered.
- **In the app (ODbL §4.3):** the map already credits OpenStreetMap, linked to its copyright page,
  through the attribution of the OpenFreeMap tiles (`apps/web/src/lib/map-config.ts:3`; the
  `attribution` field of `https://tiles.openfreemap.org/planet`). A corner of the map is where the
  Attribution Guidelines ("Interactive maps") put it. No UI change.
- ADR-0001 step 2 now also covers the 2 GSI stops, and uses OSM rather than GSI's address search,
  whose results need the CSIS credit. Follow-up 1 stays open, and the takeover stays in "tidy".
- From ADR-0001 Decision 1, "replace the 56 pins" still holds; "label the 27 stops" and "GSI's
  credit" are replaced by this ADR. ADR-0001's decision text is unchanged; only its Status points
  here.

## Next steps

1. **ADR-0001 step 2, widened:** re-locate the 56 My Maps stops and the 2 GSI stops from OSM.
   Update their `coordSource` and their `stop_evidence.json` entries, add the ODbL notice to
   `stop_evidence.json`'s `_doc`, and remove both exceptions from DATA-LICENSES.md.
