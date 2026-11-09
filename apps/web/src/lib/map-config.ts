export const HAKUBA_VIEW = { latitude: 36.7, longitude: 137.86, zoom: 11 };

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const LICENCES_URL =
  "https://github.com/r03922123/jp_ski_map/blob/main/DATA-LICENSES.md";

/** Shown after the tile style's own credits. Overture's providers ask for their licence (ADR-0004). */
export const MAP_ATTRIBUTION = `Snow: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> | Shuttle: <a href="https://www.hakubavalley.com/en/access_en/shuttlebus_en/" target="_blank" rel="noopener">Hakuba Valley</a> | Places: <a href="https://overturemaps.org/" target="_blank" rel="noopener">Overture Maps Foundation</a> (<a href="${LICENCES_URL}" target="_blank" rel="noopener">licences</a>)`;

/** Copied from node_modules by scripts/copy-maplibre-worker.mjs before dev/build. */
export const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
