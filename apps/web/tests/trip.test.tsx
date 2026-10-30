import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TripPanel, type TripPanelProps } from "@/components/TripPanel";
import type { Route } from "@/lib/api";
import { prepare } from "@/lib/nav/project";
import { stopsAhead } from "@/lib/nav/stops";
import { parseViewState, serializeViewState } from "@/lib/url-state";

const hotel = {
  id: "h",
  name: "Hotel Hakuba",
  coord: { lat: 36.697, lng: 137.854 },
  kind: "lodging" as const,
};
const resort = {
  id: "happo-one",
  name: "Happo-One",
  coord: { lat: 36.7, lng: 137.83 },
  kind: "resort" as const,
};
const konbini = {
  id: "k",
  name: "7-Eleven Happo",
  coord: { lat: 36.699, lng: 137.845 },
  kind: "poi" as const,
};

function renderTrip(props: Partial<TripPanelProps> = {}) {
  const handlers = {
    onAddStop: vi.fn(),
    onRemoveStop: vi.fn(),
    onFillStop: vi.fn(),
    onClearTo: vi.fn(),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TripPanel
        from={hotel}
        to={resort}
        stops={[]}
        canAddStop
        near={null}
        {...handlers}
        {...props}
      />
    </QueryClientProvider>,
  );
  return handlers;
}

describe("TripPanel", () => {
  it("lists From, the stops and To, each with a Save star", () => {
    renderTrip({ stops: [{ key: "s1", place: konbini }] });
    const rows = within(
      screen.getByRole("list", { name: "Trip" }),
    ).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Hotel Hakuba"),
      expect.stringContaining("7-Eleven Happo"),
      expect.stringContaining("Happo-One"),
    ]);
    expect(
      screen.getByRole("button", { name: "Save 7-Eleven Happo" }),
    ).toBeInTheDocument();
  });

  it("adds a stop, and an empty stop is a search box that says the map works too", () => {
    const h = renderTrip({ stops: [{ key: "s1", place: null }] });
    expect(
      screen.getByRole("combobox", { name: "Stop 1" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/or tap the map/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
    expect(h.onAddStop).toHaveBeenCalled();
  });

  it("removes a stop and clears the destination with their ✕", () => {
    const h = renderTrip({ stops: [{ key: "s1", place: konbini }] });
    fireEvent.click(screen.getByRole("button", { name: "Remove stop 1" }));
    expect(h.onRemoveStop).toHaveBeenCalledWith("s1");
    fireEvent.click(screen.getByRole("button", { name: "Remove destination" }));
    expect(h.onClearTo).toHaveBeenCalled();
  });

  it("offers no Add stop when stops aren't possible (bus mode, no destination, at the limit)", () => {
    renderTrip({ canAddStop: false });
    expect(screen.queryByRole("button", { name: "Add stop" })).toBeNull();
  });
});

describe("stops in the URL", () => {
  it("round-trips stops=lat,lng;lat,lng and ignores junk", () => {
    const view = parseViewState(
      "?from=36.697,137.854&mode=drive&stops=36.699,137.845;36.7,137.84",
    );
    expect(view.stops).toEqual([
      { lat: 36.699, lng: 137.845 },
      { lat: 36.7, lng: 137.84 },
    ]);
    expect(serializeViewState(view)).toContain(
      "stops=36.69900%2C137.84500%3B36.70000%2C137.84000",
    );
    expect(parseViewState("?stops=nope;36.7,137.84").stops).toEqual([
      { lat: 36.7, lng: 137.84 },
    ]);
    expect(parseViewState("?").stops).toEqual([]);
  });
});

describe("stopsAhead (reroutes keep the stops not reached yet)", () => {
  // a straight route with "Arrive at stop 1" at vertex 3 and "stop 2" at vertex 6
  const coordinates = Array.from({ length: 10 }, (_, i) => [
    137.85 + i * 0.001,
    36.7,
  ]);
  const step = (
    instruction: string,
    maneuver: string,
    a: number,
    b: number,
  ) => ({
    instruction,
    maneuver,
    distanceM: 0,
    durationS: 0,
    streetNames: [],
    shapeRange: [a, b],
  });
  const route = {
    mode: "drive",
    durationS: 100,
    distanceM: 900,
    isEstimate: false,
    geometry: { type: "LineString", coordinates },
    steps: [
      step("Drive east.", "depart", 0, 3),
      step(
        "Arrive at stop 1. Your destination is on the right.",
        "arrive",
        3,
        3,
      ),
      step("Drive east.", "depart", 3, 6),
      step(
        "Arrive at stop 2. Your destination is on the left.",
        "arrive",
        6,
        6,
      ),
      step("Drive east.", "depart", 6, 9),
      step("You have arrived at your destination.", "arrive", 9, 9),
    ],
  } as unknown as Route;
  const stops = [
    { lat: 36.7, lng: 137.853 },
    { lat: 36.7, lng: 137.856 },
  ];

  it("keeps every stop before the first one is reached, then drops passed ones", () => {
    const r = prepare(route);
    expect(stopsAhead(r, 0, stops)).toEqual(stops);
    expect(stopsAhead(r, r.cum[4], stops)).toEqual([stops[1]]);
    expect(stopsAhead(r, r.cum[8], stops)).toEqual([]);
  });
});
