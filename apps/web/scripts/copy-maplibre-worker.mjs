// MapLibre resolves its worker relative to its own module URL, which breaks once the
// library is bundled into /_next/static/chunks. Serve the (self-contained) worker from
// public/ instead; MapView points setWorkerUrl() at it.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const source = require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs");

mkdirSync("public/maplibre", { recursive: true });
copyFileSync(source, "public/maplibre/maplibre-gl-worker.mjs");
