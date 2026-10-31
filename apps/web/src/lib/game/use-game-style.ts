"use client";

import type { StyleSpecification } from "maplibre-gl";
import { useEffect, useState } from "react";
import { gameStyle } from "@/lib/game/map-style";

/**
 * The base map style restyled as the overworld (SPEC-game-theme). null while it loads;
 * if it can't be fetched, the plain style URL, so the map still works.
 */
export function useGameStyle(url: string): StyleSpecification | string | null {
  const [style, setStyle] = useState<StyleSpecification | string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(url)
      .then((r) =>
        r.ok ? (r.json() as Promise<StyleSpecification>) : Promise.reject(),
      )
      .then((base) => live && setStyle(gameStyle(base)))
      .catch(() => live && setStyle(url));
    return () => {
      live = false;
    };
  }, [url]);
  return style;
}
