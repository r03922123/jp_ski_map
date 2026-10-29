"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

// MapLibre needs WebGL and `window`, so the map is rendered in the browser only.
const MapView = dynamic(() => import("./MapView"), { ssr: false });

export function MapShell() {
  const [loaded, setLoaded] = useState(false);

  return (
    <main className="fixed inset-0" data-map-loaded={loaded}>
      <MapView onLoad={() => setLoaded(true)} />
    </main>
  );
}
