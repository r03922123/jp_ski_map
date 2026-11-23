export const HAKUBA_VIEW = { latitude: 36.7, longitude: 137.86, zoom: 11 };

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/**
 * Terrain for the hillshade (SPEC-ski-runs v2); Japan at 1–10 m, free for app use per its FAQ.
 * The tiles directly, not its TileJSON: that would put its credit first, ahead of OpenStreetMap's.
 */
export const TERRAIN_TILES = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp";

const LICENCES_URL =
  "https://github.com/r03922123/jp_ski_map/blob/main/DATA-LICENSES.md";

/** Shown after the tile style's own credits. Overture's providers ask for their licence (ADR-0004). */
export const MAP_ATTRIBUTION = `Runs: <a href="https://openskimap.org" target="_blank" rel="noopener">OpenSkiMap</a> | Snow: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> | Shuttle: <a href="https://www.hakubavalley.com/en/access_en/shuttlebus_en/" target="_blank" rel="noopener">Hakuba Valley</a> | Places: <a href="https://overturemaps.org/" target="_blank" rel="noopener">Overture Maps Foundation</a> (<a href="${LICENCES_URL}" target="_blank" rel="noopener">licences</a>) | Terrain: <a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">Mapterhorn</a>`;

/** Copied from node_modules by scripts/copy-maplibre-worker.mjs before dev/build. */
export const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
