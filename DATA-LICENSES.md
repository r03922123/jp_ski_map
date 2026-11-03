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
| Resorts, bus stops, timetables, crowd periods | `data/resorts.json`, `data/bus_stops.json`, `data/bus/timetables/`, `data/crowd_periods.json` | Compiled by hand for this project; timetables transcribed from the operators' published 2025–26 timetables (sources listed in `data/bus/sources.json`) | Facts compiled for trip planning | — |

**ODbL note.** The OpenStreetMap-derived files stay under ODbL, and anything built from them falls under its share-alike terms. That doesn't change the licence of the code that reads them.

**Timetables.** The operators' original PDFs and photos are kept out of the repository. Only the transcribed departure times are committed. They may be out of date or contain mistakes, so always check the official timetable before you travel.
