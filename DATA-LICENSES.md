# Data sources and licences

The code in this repository is MIT-licensed (see [LICENSE](LICENSE)). The data below is **not** covered by the MIT licence. Each source keeps its own licence, and using this data means following those terms.

| Data | Where | Source | Licence | Attribution |
|---|---|---|---|---|
| Lodging and POI snapshots | `data/lodging_osm.json`, `data/poi_osm.json` | [OpenStreetMap](https://www.openstreetmap.org) via Overpass | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) | © OpenStreetMap contributors |
| Lodging places | `data/lodging_overture.json` (`.meta.json` records the release) | [Overture Maps Foundation](https://overturemaps.org) Places | [CDLA-Permissive-2.0](https://cdla.dev/permissive-2-0/) | Overture Maps Foundation |
| Road network for routing | built into `infra/valhalla` tiles at setup (not committed) | OpenStreetMap | ODbL 1.0 | © OpenStreetMap contributors |
| Map tiles (shown in the app) | fetched at runtime | [OpenFreeMap](https://openfreemap.org) / OpenMapTiles | OpenStreetMap data, ODbL | © OpenMapTiles, © OpenStreetMap contributors |
| Place search fallback | queried at runtime | [Photon](https://photon.komoot.io) by komoot | OpenStreetMap data, ODbL | © OpenStreetMap contributors |
| Snow and weather | queried at runtime | [Open-Meteo](https://open-meteo.com) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Weather data by Open-Meteo.com |
| Resorts, bus stops, stop evidence | `data/resorts.json`, `data/bus_stops.json`, `data/bus/stop_evidence.json` | Compiled for this project, with coordinates from [OpenStreetMap](https://www.openstreetmap.org), except the stops listed below | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), whole file, except the stops listed below | © OpenStreetMap contributors |
| Timetables, crowd periods | `data/bus/timetables/`, `data/crowd_periods.json` | Compiled by hand for this project; timetables transcribed from the operators' published 2025–26 timetables (sources listed in `data/bus/sources.json`) | Facts compiled for trip planning | — |

**ODbL note.** The OpenStreetMap-derived files stay under ODbL, and anything built from them falls under its share-alike terms. That doesn't change the licence of the code that reads them. The JSON files carry no notice of their own, so this file is the notice.

**Resorts, bus stops and stop evidence.** In these three files one coordinate field mixes OpenStreetMap values with values from elsewhere, so ODbL covers each file as a whole, not only its OpenStreetMap rows ([ADR-0002](docs/adr/0002-data-files-odbl.md)). From OpenStreetMap: 40 of the 100 stops (12 OSM points, 8 from the lodging snapshot, 7 via Photon, 13 resort access points), all 12 resort access points, and 8 of the 66 evidence entries. Two groups are not covered yet, and ADR-0001 step 2 will re-locate them from OpenStreetMap:

- **56 Google My Maps pins:** the stops whose `coordSource` starts with `operator My Maps pin`, and the same 56 entries in `stop_evidence.json`. Copied from the bus operator's Google My Maps; their licence is unresolved.
- **2 GSI-geocoded stops:** the stops whose `coordSource` starts with `gsi:`. Geocoded through the address search of Japan's Geospatial Information Authority (GSI), which answers address queries with CSIS Simple Geocoding (University of Tokyo).

The other 2 stops have no coordinates yet (`coord` is `null`).

**Timetables.** The operators' original PDFs and photos are kept out of the repository. Only the transcribed departure times are committed. They may be out of date or contain mistakes, so always check the official timetable before you travel.
