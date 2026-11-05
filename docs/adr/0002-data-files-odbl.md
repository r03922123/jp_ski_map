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
   (11 lift terminals and 1 building). So `resorts.json` holds OSM coordinates too, yet
   [DATA-LICENSES.md line 13](https://github.com/r03922123/jp_ski_map/blob/f3c039a/DATA-LICENSES.md#L13)
   called it "Compiled by hand". `data/bus/stop_evidence.json`, the stop locator's input, holds 8
   OSM points and the same 56 My Maps pins, and DATA-LICENSES.md didn't list it.
2. **In two files one field mixes OSM and non-OSM values, so the Collective Database safe harbour
   doesn't apply.** [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) §1 defines a
   Collective Database as the database in unmodified form beside independent databases. The OSMF's
   [Collective Database Guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Collective_Database_Guideline_Guideline)
   (endorsed 2016-06-17) offers a safe harbour: OSM and non-OSM data count as independent when a
   data type is "either all OSM or all non-OSM within the same regional cut". It says this isn't the
   only way to avoid share-alike, but its third example, a private list topped up with OSM data,
   falls outside it, and the other data then may be subject to share-alike.
   - `bus_stops.json` and `stop_evidence.json` mix: the bus stops' `coord` field is 40 OSM, 56 My
     Maps, 2 GSI and 2 empty, and the evidence file's points are 8 OSM and 56 My Maps. To be safe, we treat each as a Derivative Database (ODbL §1 and
     §4.4.b) if the OSM part is Substantial; share-alike (§4.4.a) then covers the whole file.
   - `resorts.json` doesn't mix: its only coordinates are the 12 OSM access points, and its other
     fields hold no OSM data. It fits the safe harbour, so share-alike would reach only its
     coordinates.
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
   (`services/api/src/hakuba_api/bus/locate_stops.py:27`). GSI's answer on its own tracker
   ([gsi-cyberjapan/gsimaps#29](https://github.com/gsi-cyberjapan/gsimaps/issues/29), 2015, edited
   2021) says that endpoint is meant mainly for GSI's own map, may change without notice, and
   answers address queries with CSIS Simple Geocoding (University of Tokyo). GSI's
   [content terms](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html) §2 leave
   third-party content to its owner. The
   [CSIS terms](https://geocode.csis.u-tokyo.ac.jp/home/simple-geocoding/simple-geocoding-tems-of-use/)
   count indirect callers as users (第1条(3)) and ask for a CSIS credit on the map or in the app
   (第4条(1) and (4)).

## Decision

### 1. Three data files are ODbL 1.0 as whole files

`data/bus_stops.json`, `data/resorts.json` and `data/bus/stop_evidence.json` are under ODbL 1.0,
credited "© OpenStreetMap contributors".

- For `bus_stops.json` and `stop_evidence.json` this holds under both readings: under A it is
  required, and under B it is allowed.
- For `resorts.json` it is a choice: only its coordinates need ODbL, but one rule for all three
  files is simpler to follow and to check.

The cost is listed under Consequences.

### 2. Two groups are named, not covered, until ADR-0001 step 2

- **The 56 Google My Maps pins** in `bus_stops.json`, and the same 56 entries in
  `stop_evidence.json`. Their licence is unresolved. Under reading A, ODbL has no way to except
  rows: §4.4.a puts a publicly used Derivative Database under ODbL as a whole, and §4.4.d forbids
  adding content that is incompatible with it. So if the pins prove incompatible, they must leave
  the file. Naming them discloses the gap; step 2 closes it.
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

- Not enough under reading A: share-alike reaches the whole of a file whose coordinate field is
  mixed.

### Reading B: no ODbL label

- Only the 7 Photon rows clearly fit the Geocoding Guideline; resting the other 33 on it is a guess.

### A CSIS credit in the app for the 2 GSI stops

- A UI change, and it keeps the data tied to an endpoint GSI says may change without notice.

## Consequences

- DATA-LICENSES.md now says where the coordinates came from, and names the two groups it doesn't
  cover.
- **Cost:** our hand-compiled facts in the three files (resort stats, stop names and aliases,
  evidence sources) are now ODbL too, so anyone who reuses them must share alike.
- **Known gap until step 2:** the 56 My Maps pins and the 2 GSI stops stay in public files that
  this ADR labels ODbL. That is the risk ADR-0001 already accepted until follow-up 1 is done.
- **ODbL §4.6:** whoever publicly uses a Derivative Database must offer it in machine-readable form.
  The public repository does that today. If it ever goes private, the three files must still be
  offered.
- **In the app (ODbL §4.3):** the map already credits OpenStreetMap, linked to its copyright page,
  through the attribution of the OpenFreeMap tiles (the `attribution` field of
  `https://tiles.openfreemap.org/planet`), shown by the map's attribution control
  (`apps/web/src/components/MapView.tsx:470`) and checked by `apps/web/e2e/map.spec.ts:23`. A
  corner of the map is where the Attribution Guidelines ("Interactive maps") put it. No UI change.
- ADR-0001 step 2 now also covers the 2 GSI stops, and uses OSM rather than GSI's address search,
  whose results need the CSIS credit. Follow-up 1 stays open, and the takeover stays in "tidy".
- From ADR-0001 Decision 1, "replace the 56 pins" still holds; "label the 27 stops" and "GSI's
  credit" are replaced by this ADR. ADR-0001's decision text is unchanged; only its Status points
  here.

## Next steps

1. **ADR-0001 step 2, widened:** re-locate the 56 My Maps stops and the 2 GSI stops from OSM.
   Update their `coordSource` and their `stop_evidence.json` entries, add the ODbL notice to
   `stop_evidence.json`'s `_doc`, and remove both groups from DATA-LICENSES.md. A stop with no OSM
   feature needs another source that is neither the Google pin nor GSI's address search; step 2's
   PR proposes one.
