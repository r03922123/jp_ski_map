import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TripPanel,
  type TripPanelProps,
  type TripStop,
} from "@/components/TripPanel";
import type { Route, Suggestion } from "@/lib/api";
import * as api from "@/lib/api";
import { prepare } from "@/lib/nav/project";
import { numberStops, STOP_REACHED_M, stopsAhead } from "@/lib/nav/stops";
import { MAX_STOPS, parseViewState, serializeViewState } from "@/lib/url-state";

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

afterEach(() => vi.restoreAllMocks());

function renderTrip(props: Partial<TripPanelProps> = {}) {
  const handlers = {
    onAddStop: vi.fn(),
    onRemoveStop: vi.fn(),
    onFillStop: vi.fn(),
    onClearFrom: vi.fn(),
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

  it("an empty stop is a search box that says the map works too, and its ✕ removes it before typing", () => {
    const h = renderTrip({ stops: [{ key: "s1", place: null }] });
    const box = screen.getByRole("combobox", { name: "Stop 1" });
    expect(box).toHaveAttribute(
      "placeholder",
      expect.stringMatching(/tap the map/i),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove stop 1" }));
    expect(h.onRemoveStop).toHaveBeenCalledWith("s1");
  });

  it("✕ on each row: removes a stop, clears the start, clears the destination", () => {
    const h = renderTrip({ stops: [{ key: "s1", place: konbini }] });
    fireEvent.click(screen.getByRole("button", { name: "Remove stop 1" }));
    expect(h.onRemoveStop).toHaveBeenCalledWith("s1");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove starting point" }),
    );
    expect(h.onClearFrom).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove destination" }));
    expect(h.onClearTo).toHaveBeenCalled();
  });

  it("has no ✕ on To when the destination isn't the user's to clear (bus: the chosen option's stop)", () => {
    renderTrip({ onClearTo: undefined });
    expect(
      screen.queryByRole("button", { name: "Remove destination" }),
    ).toBeNull();
  });

  it("shows the stops and the destination while the start is being changed", () => {
    renderTrip({ from: null, stops: [{ key: "s1", place: konbini }] });
    const rows = within(
      screen.getByRole("list", { name: "Trip" }),
    ).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Remove stop 1" }),
    ).toBeInTheDocument();
  });

  it("offers no Add stop when stops aren't possible (bus mode, no destination, at the limit)", () => {
    renderTrip({ canAddStop: false });
    expect(screen.queryByRole("button", { name: "Add stop" })).toBeNull();
  });
});

describe("TripPanel with its state (add → type → pick)", () => {
  const sevenEleven: Suggestion = {
    id: "osm:node/1",
    kind: "convenience",
    name: "7-Eleven Happo",
    nameJa: null,
    coord: { lat: 36.699, lng: 137.845 },
    detail: "Convenience store",
    match: [0, 8],
    source: "index",
  };

  function Harness() {
    const [stops, setStops] = useState<TripStop[]>([]);
    return (
      <TripPanel
        from={hotel}
        to={resort}
        stops={stops}
        canAddStop={stops.every((s) => s.place !== null)}
        near={null}
        onAddStop={() =>
          setStops((l) => [...l, { key: `s${l.length + 1}`, place: null }])
        }
        onRemoveStop={(key) => setStops((l) => l.filter((s) => s.key !== key))}
        onFillStop={(key, place) =>
          setStops((l) => l.map((s) => (s.key === key ? { ...s, place } : s)))
        }
        onClearFrom={() => {}}
        onClearTo={() => {}}
      />
    );
  }

  it("fills the stop from a suggestion, then hands focus to Add stop (not to the page)", async () => {
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([sevenEleven]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Harness />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
    const box = screen.getByRole("combobox", { name: "Stop 1" });
    expect(box).toHaveFocus();
    fireEvent.change(box, { target: { value: "7-Ele" } });
    fireEvent.click(
      await screen.findByRole("option", { name: /7-Eleven Happo/ }),
    );

    const rows = within(
      screen.getByRole("list", { name: "Trip" }),
    ).getAllByRole("listitem");
    expect(rows[1]).toHaveTextContent("7-Eleven Happo");
    expect(screen.getByRole("button", { name: "Add stop" })).toHaveFocus();

    // removing it also keeps focus in the panel
    fireEvent.click(screen.getByRole("button", { name: "Remove stop 1" }));
    expect(screen.getByRole("button", { name: "Add stop" })).toHaveFocus();
  });
});

describe("stops in the URL", () => {
  it("round-trips stops=lat,lng;lat,lng", () => {
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
    expect(parseViewState("?").stops).toEqual([]);
  });

  it("ignores junk, including empty parts (Number('') is 0: Null Island)", () => {
    expect(
      parseViewState("?stops=nope;36.7,137.84;,;36.7,;,137.8").stops,
    ).toEqual([{ lat: 36.7, lng: 137.84 }]);
    expect(parseViewState("?from=36.7,").origin).toBeNull();
  });

  it("keeps at most MAX_STOPS from a link", () => {
    const many = Array.from({ length: 8 }, (_, i) => `36.7,137.8${i}`).join(
      ";",
    );
    expect(parseViewState(`?stops=${many}`).stops).toHaveLength(MAX_STOPS);
  });
});

describe("stop numbers and reroutes", () => {
  // a straight route with "Arrive at stop 1" at vertex 3 and "stop 2" at vertex 6 (~89 m apart)
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
      step("Arrive at stop 1, on the right.", "arrive", 3, 3),
      step("Drive east.", "depart", 3, 6),
      step("Arrive at stop 2.", "arrive", 6, 6),
      step("Drive east.", "depart", 6, 9),
      step("You have arrived at your destination.", "arrive", 9, 9),
    ],
  } as unknown as Route;
  const a = { n: 1, coord: { lat: 36.7, lng: 137.853 } };
  const b = { n: 2, coord: { lat: 36.7, lng: 137.856 } };

  it("keeps every stop until it is reached, then drops it", () => {
    const r = prepare(route);
    expect(stopsAhead(r, 0, [a, b])).toEqual([a, b]);
    expect(stopsAhead(r, r.cum[4], [a, b])).toEqual([b]);
    expect(stopsAhead(r, r.cum[8], [a, b])).toEqual([]);
  });

  it("counts a stop as reached just before it (turning into its car park)", () => {
    const r = prepare(route);
    expect(stopsAhead(r, r.cum[3] - (STOP_REACHED_M - 10), [a, b])).toEqual([
      b,
    ]);
    expect(stopsAhead(r, r.cum[3] - (STOP_REACHED_M + 30), [a, b])).toEqual([
      a,
      b,
    ]);
  });

  it("matches stops by their trip number after a reroute renumbered them", () => {
    // rerouted through b only: the server calls it stop 1, the trip calls it stop 2
    const rerouted = numberStops(
      {
        ...route,
        steps: [
          step("Drive east.", "depart", 0, 6),
          step("Arrive at stop 1.", "arrive", 6, 6),
          step("Drive east.", "depart", 6, 9),
          step("You have arrived at your destination.", "arrive", 9, 9),
        ],
      } as unknown as Route,
      [2],
    );
    expect(rerouted.steps[1].instruction).toBe("Arrive at stop 2.");
    const r = prepare(rerouted);
    expect(stopsAhead(r, 0, [b])).toEqual([b]);
    expect(stopsAhead(r, r.cum[7], [b])).toEqual([]);
  });

  it("numberStops keeps the side wording and leaves other steps alone", () => {
    const renumbered = numberStops(route, [3, 5]);
    expect(renumbered.steps.map((s) => s.instruction)).toEqual([
      "Drive east.",
      "Arrive at stop 3, on the right.",
      "Drive east.",
      "Arrive at stop 5.",
      "Drive east.",
      "You have arrived at your destination.",
    ]);
  });
});
