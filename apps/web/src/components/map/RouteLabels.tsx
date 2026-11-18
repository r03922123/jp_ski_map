import { useMemo } from "react";
import { Marker } from "react-map-gl/maplibre";
import type { Route } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { type LngLat, labelAnchor } from "@/lib/route-geo";

/** A time chip on every route; a tap on an alternate's chip selects it. */
export function RouteLabels({
  routes,
  activeRoute,
  piloting,
  onSelectRoute,
}: {
  routes: Route[];
  activeRoute: number;
  piloting: boolean;
  onSelectRoute?: (index: number) => void;
}) {
  const active = routes[activeRoute] ?? null;
  const labels = useMemo(
    () =>
      routes.map((route, index) => {
        const coords = route.geometry.coordinates as LngLat[];
        const others =
          index === activeRoute
            ? [] // the active route's label sits halfway along it
            : routes
                .filter((_, j) => j !== index)
                .map((r) => r.geometry.coordinates as LngLat[]);
        return {
          index,
          at: coords.length ? labelAnchor(coords, others) : null,
          text: formatDuration(route.durationS),
        };
      }),
    [routes, activeRoute],
  );
  return (
    <>
      {labels.map(
        ({ index, at, text }) =>
          at &&
          !piloting && (
            <Marker
              key={`label-${index}`}
              longitude={at[0]}
              latitude={at[1]}
              anchor="bottom"
              style={{ zIndex: index === activeRoute ? 3 : 2 }}
            >
              <button
                type="button"
                data-route-label={
                  index === activeRoute ? "active" : "alternate"
                }
                aria-label={`${index === activeRoute ? "Selected route" : "Alternate route"}, ${text}`}
                aria-pressed={index === activeRoute}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectRoute?.(index);
                }}
                className={`mb-1 whitespace-nowrap border-2 border-[var(--ink)] px-2 py-1 text-xs shadow-[2px_2px_0_var(--ink)] ${
                  index === activeRoute
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-card-foreground"
                }`}
              >
                {active?.mode === "walk" ? "🚶 " : "🚗 "}
                {text}
              </button>
            </Marker>
          ),
      )}
    </>
  );
}
