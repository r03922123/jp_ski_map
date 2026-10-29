"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { setWorkerUrl } from "maplibre-gl";
import MapGL, { NavigationControl } from "react-map-gl/maplibre";
import {
  HAKUBA_VIEW,
  MAP_STYLE_URL,
  MAPLIBRE_WORKER_URL,
} from "@/lib/map-config";

setWorkerUrl(MAPLIBRE_WORKER_URL);

export default function MapView({ onLoad }: { onLoad?: () => void }) {
  return (
    <MapGL
      initialViewState={HAKUBA_VIEW}
      mapStyle={MAP_STYLE_URL}
      style={{ position: "absolute", inset: 0 }}
      onLoad={onLoad}
    >
      <NavigationControl position="bottom-right" />
    </MapGL>
  );
}
