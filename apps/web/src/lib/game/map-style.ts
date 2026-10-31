import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

/** The overworld palette for the base map (SPEC-game-theme "Map style"). */
export const GAME_COLORS = {
  snow: "#f4f8fb",
  water: "#9cc9e6",
  waterway: "#7fb3d5",
  pine: "#2f5d50",
  forest: "#d3e4da", // snowy forest: most of the valley, so it stays pale
  meadow: "#dfeae3",
  ice: "#ffffff",
  village: "#ece6dc",
  wood: "#c9a27e",
  outline: "#3b3b4f",
  motorway: "#f2b134",
  major: "#ffe9a8",
  lane: "#fffaf0",
  label: "#fffaf0",
} as const;

type Paint = Record<string, unknown>;

/** New colours for one layer, by its id in OpenFreeMap "liberty"; null = unchanged. */
function recolor(layer: LayerSpecification): Paint | null {
  const id = layer.id;
  const c = GAME_COLORS;
  switch (layer.type) {
    case "background":
      return { "background-color": c.snow };
    case "fill":
      if (id === "water") return { "fill-color": c.water };
      if (id === "landcover_wood")
        return { "fill-color": c.forest, "fill-opacity": 1 };
      if (id === "landcover_grass" || id === "park")
        return { "fill-color": c.meadow };
      if (id === "landcover_ice") return { "fill-color": c.ice };
      if (id === "landuse_residential") return { "fill-color": c.village };
      if (id === "building") return { "fill-color": c.wood };
      return null;
    case "fill-extrusion":
      return { "fill-extrusion-color": c.wood };
    case "line": {
      if (id.startsWith("waterway")) return { "line-color": c.waterway };
      const road = /^(road|tunnel|bridge)_/.test(id);
      if (!road || /rail|path|pedestrian|one_way/.test(id)) return null;
      // chunky roads: every road gets a dark outline, then an amber or cream fill
      if (id.endsWith("_casing")) return { "line-color": c.outline };
      if (id.includes("motorway")) return { "line-color": c.motorway };
      if (/trunk|primary|secondary|tertiary/.test(id))
        return { "line-color": c.major };
      return { "line-color": c.lane };
    }
    case "symbol":
      if (/^(label_|water_name|waterway_line_label|highway-name|poi_)/.test(id))
        return {
          "text-color": c.label,
          "text-halo-color": c.outline,
          "text-halo-width": 1.5,
        };
      return null;
    default:
      return null;
  }
}

/**
 * The base style restyled as a snowy overworld. Only paint colours change: every layer,
 * source, filter, layout and zoom-dependent width survives, so the map reads as before.
 */
export function gameStyle(base: StyleSpecification): StyleSpecification {
  return {
    ...base,
    layers: base.layers.map((layer) => {
      const colors = recolor(layer);
      if (!colors) return layer;
      const paint = { ...("paint" in layer ? layer.paint : {}), ...colors };
      return { ...layer, paint } as LayerSpecification;
    }),
  };
}
