import { describe, expect, it, vi } from "vitest";
import { keepRouteLayerOrder, ROUTE_LAYER_ORDER } from "@/components/MapView";

/** A tiny stand-in for a MapLibre map: a list of layer ids, moveLayer to the top. */
function fakeMap(ids: string[]) {
  const layers = [...ids];
  return {
    layers,
    getLayer: (id: string) => (layers.includes(id) ? { id } : undefined),
    getStyle: () => ({ layers: layers.map((id) => ({ id })) }),
    moveLayer: vi.fn((id: string) => {
      layers.splice(layers.indexOf(id), 1);
      layers.push(id);
    }),
  };
}

describe("keepRouteLayerOrder", () => {
  it("puts a late-added bus line back under the walk route, stop dots on top", () => {
    const map = fakeMap([
      "base-road",
      "route-active-line",
      "ride-stop-dots",
      "ride-line",
    ]);
    keepRouteLayerOrder(map as never);
    expect(map.layers).toEqual([
      "base-road",
      "ride-line",
      "route-active-line",
      "ride-stop-dots",
    ]);
  });

  it("does nothing when the order is already right (no style-change loop)", () => {
    const map = fakeMap([
      "base-road",
      "ride-line",
      "route-active-line",
      "ride-stop-dots",
    ]);
    keepRouteLayerOrder(map as never);
    expect(map.moveLayer).not.toHaveBeenCalled();
  });

  it("knows every route layer MapView draws", () => {
    expect(ROUTE_LAYER_ORDER).toContain("route-covered-line");
    // stop names on top, then their dots under them
    expect(ROUTE_LAYER_ORDER.slice(-2)).toEqual([
      "ride-stop-dots",
      "ride-stop-names",
    ]);
  });
});
