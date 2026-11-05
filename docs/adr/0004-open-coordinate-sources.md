# ADR-0004: Bus-stop coordinates may come from Overture Maps Places as well as OpenStreetMap

## Status

Accepted (2026-11-06) in [PR #21](https://github.com/r03922123/jp_ski_map/pull/21). Carries out
[ADR-0002](0002-data-files-odbl.md) next step 1 for the stops OpenStreetMap doesn't have.

## Date

2026-11-06

## Context

After PRs #17 and #18, 48 stops still used a coordinate whose licence is unresolved: 47 pins from
the Hakuba Valley Promotion Board's Google My Maps, and 1 GSI address-search result (backed by
CSIS, which wants a credit in the app). The board's site has a copyright line but no reuse terms.
The owner will ask for permission only for the stops that no licence-clean source covers.

On 2026-11-06 five searches looked for another source for each stop: a deeper OpenStreetMap
search, open transit data, government address registries, Overture/Wikidata/GeoNames/Commons,
and a licence review. Two independent reviews then re-checked the coordinates and the licences.

**What the licences allow.** A source is clean when its terms let us put its points into an ODbL
1.0 file with credit. This is a reading of licence text, not legal advice.

| Source | Licence | Verdict | Why |
|---|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | ODbL 1.0 | clean | Same licence as the files. |
| [Overture Maps Places](https://docs.overturemaps.org/attribution/), Meta and Microsoft records | [CDLA-Permissive-2.0](https://cdla.dev/permissive-2-0/) | clean | §2.1 allows sharing, changed or not, if the licence text goes with the data. The OSMF's [compatibility page](https://osmfoundation.org/wiki/Licence/Licence_Compatibility) rates it compatible. |
| Overture Maps Places, Foursquare records | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | clean | §4 allows sharing changed copies, and a larger work may carry other terms. Conditions: the licence text (§4(a)), a notice of our changes (§4(b)), the notices that came with the data (§4(c)) and Foursquare's NOTICE (§4(d)). No share-alike, no ban on technical measures. |
| Overture Maps Places, AllThePlaces records | CC0 1.0 | not used | The waiver covers the compilation, but the points are scraped from brands' own sites. |
| [ODPT](https://ckan.odpt.org/dataset/swat_hakuba_demand_taxi): Hakuba Village's demand-taxi feeds | CC BY 4.0 | rejected for now | Needs the publisher's waiver to sit in an ODbL file; see below. |
| Address Base Registry lot points (from the Ministry of Justice's registry maps) | PDL1.0 + MOJ terms | unclear | MOJ terms 2)ウ and 3)ケ let MOJ restrict any use it judges inappropriate; the OSMF calls licences revocable without reason incompatible. |
| Wikidata hotel coordinates | CC0 | unclear | Their values cite Skyscanner or Hostelworld; CC0 can't license what the uploader copied. |
| GSI address search (CSIS) | CSIS terms | unclear | As in ADR-0002. |

**Why ODPT waits.** Two GTFS-Flex feeds that Hakuba Village (白馬村) publishes are on ODPT under
CC BY 4.0, catalogued by SWAT Mobility:
[白馬村 ナイトデマンドタクシー / Hakuba Night Demand Taxi](https://ckan.odpt.org/dataset/swat_hakuba_demand_taxi)
and
[白馬村 デマンドタクシー「ふれAI号」 / Hakuba Village On-Demand Taxi "Fure AI"](https://ckan.odpt.org/dataset/ai-hakuba-village-on-demand-taxi-fure-ai).
CC BY 4.0 §2(a)(5)(B), "No downstream restrictions", bans applying technological measures to the
material, while ODbL §4.7 allows them beside a parallel copy. So the OSMF takes CC BY data into
its ODbL database only with a waiver of that clause
([compatibility page](https://osmfoundation.org/wiki/Licence/Licence_Compatibility),
[2017 post](https://blog.openstreetmap.org/2017/03/17/use-of-cc-by-data/)), and ODbL §4.4.d
forbids adding incompatible contents to our ODbL files too. Three stops would have taken an ODPT
point. Pension Minamijujisei has a clean Overture point instead; Suisha-Goya and Shirouma Pal
House have none.

**The pin rule.** The old pin may steer the search and may reject a candidate, but it never picks
one. Where a source has more than one same-name candidate, name, address or feature type decides,
because the pin's licence is the problem being removed. The pin is then only a sanity check.

## Decision

### 1. One more coordinate source: Overture Maps Places

`data/bus_stops.json` and `data/bus/stop_evidence.json` may take points from Overture Maps Places
records that come from Meta or Microsoft (CDLA-Permissive-2.0) or from Foursquare (Apache-2.0).
The files stay ODbL 1.0 as whole files ([ADR-0002](0002-data-files-odbl.md)). Each Overture row
also keeps its own licence:

- its `coordSource` starts with `overture:` and names the record id, the release and the licence;
- DATA-LICENSES.md credits Overture, repeats Overture's notice for Foursquare data and says how we
  changed the records;
- `LICENSES/` holds the CDLA-Permissive-2.0 and Apache-2.0 texts and Foursquare's NOTICE.txt.

`services/api/tests/test_data_licenses.py` fails if a stop names a source outside this list, or if
DATA-LICENSES.md's counts drift from the data.

### 2. How a point is chosen

- **Order of preference:** an official transit point (only with a name match), an OSM feature, a
  building, an address block.
- **A stop that serves two hotels** takes the first-named hotel.
- **The pin:** see the pin rule. A clean point more than 150 m from the old pin is rejected, and
  when two clean points disagree by more than 100 m, the record says so.
- **Approximate:** a point that marks a lot, slope base, roundabout or hotel rather than the
  boarding point gets `(approximate)` in `coordSource` and `"approx": true` in the evidence.
- **Address-registry points** may confirm an address but are never a value.

### 3. 33 stops move, in two PRs; 15 wait for permission

| Source | Stops | PR |
|---|---|---|
| OpenStreetMap | 3 | #21 |
| Overture, Meta records | 28 | 2 in #21, 26 in the next PR |
| Overture, Foursquare records | 2 | #21 |
| None clean yet | 15 | 13 with no clean source, 2 with only an ODPT point |

The 15 keep their My Maps pin and stay named in DATA-LICENSES.md, as ADR-0002 Decision 2 set out.
The GSI group ends: `stop-panorama-hotel` moves to Overture.

## Alternatives Considered

### Accept the 3 ODPT rows now, with credit per row

Rejected: without the waiver, ODbL §4.4.d forbids adding them. Revisit if Hakuba Village waives
CC BY §2(a)(5)(B); the dataset links above are where the points come from.

### Split the file by source

Keep OpenStreetMap coordinates in one file and all others in a second, joined by stop id. The
OSMF's [Collective Database Guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Collective_Database_Guideline_Guideline)
would then keep share-alike to the OSM file. Rejected: it doesn't remove the need for permission
to republish the pins, and it would split one table into two files the app must merge. Revisit if
a needed source proves incompatible with ODbL, for example permission on non-open terms.

### Use the address-registry lot points

These would add Airmail (20 m), Kanemaru (19 m) and Hakuba Inn Bloom's car park (121 m). Rejected
while the MOJ terms keep their discretionary clause.

### Ask Hakuba Valley about all 48 stops, or survey them with our own GPS

Asking about all 48 is rejected, because 33 have a clean source. A survey is licence-clean, since
the observation is ours, but it needs someone at each stop in season; it is kept as a next step.

## Consequences

- **Fewer pins.** 33 stops stop depending on the My Maps pins; 15 remain, all named.
- **More credits.** DATA-LICENSES.md credits Overture with each provider's licence, and the
  repository gains `LICENSES/`.
- **An old gap closes, partly.** `data/lodging_overture.json` already held Foursquare records (42
  of the 578 checked) under a CDLA-Permissive-2.0 label alone. DATA-LICENSES.md now names
  Apache-2.0 for them, but `data/lodging_overture.meta.json` still carries the old label.
- **Coarser positions.** A hotel point marks the building, not the bus pole. 7 of the 33 rows are
  approximate.
- **Reusers' obligations.** ODbL for each file, plus the CDLA-P text for Meta rows and Apache-2.0
  with the NOTICE for Foursquare rows.
- **Versions.** Overture publishes monthly, so each row names release 2026-10-21.0 and the record's
  id, which stays the same across releases.
- **Status.** Follow-up 1 stays open until the 15 are settled, and the takeover phase doesn't
  change.

## Next steps

1. **PR 2:** move the other 26 Overture (Meta) stops, after PR #21 merges.
2. **The lodging label:** build `data/lodging_overture.meta.json`'s licence from every record's
   sources, and fix `ATTRIBUTION` and the docstring in
   `services/api/src/hakuba_api/places/refresh_overture.py`, which write the old label. In the same
   PR, link the licence texts from the app and the API docs (CDLA-P §2.1; Foursquare's NOTICE
   recommends API docs).
3. **The owner's permission requests for the 15:**
   - To the Hakuba Valley Promotion Board, for the 13 with no clean source: `stop-airmail`,
     `stop-courtyard-by-marriott-hakuba`, `stop-echoland-main-st`, `stop-goryu-hon-dorinishi`,
     `stop-goryu-no-7-parking`, `stop-hakuba-47-ent`, `stop-hakuba-forest-ent`,
     `stop-hakuba-inn-bloom-parking`, `stop-happo-no-3-parking-b`,
     `stop-kamishiro-hakubanomori-ent`, `stop-kanemaru`, `stop-koharu-resort-hotel-suites`,
     `stop-spicy-rental-wadano`. Best: publish the shuttle stops under an open licence; otherwise,
     permission on ODbL-compatible terms.
   - To Hakuba Village, the feeds' publisher, for `stop-suisha-goya` and `stop-shirouma-pal-house`:
     a waiver of CC BY §2(a)(5)(B) like the OSMF's form, and how the pick-up points were placed.
4. **If refused:** survey those stops on site, or set their `coord` to `null`.
5. **Each Overture release:** re-check the moved rows and the 15.
