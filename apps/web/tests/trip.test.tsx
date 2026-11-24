import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DestinationBox,
  TripPanel,
  type TripPanelProps,
  type TripStop,
} from "@/components/TripPanel";
import type { Route, Suggestion } from "@/lib/api";
import * as api from "@/lib/api";
import { prepare } from "@/lib/nav/project";
import { numberStops, STOP_REACHED_M, stopsAhead } from "@/lib/nav/stops";
import type { PlaceInput } from "@/lib/saved-places";
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
    onRemoveStop: vi.fn(),
    onFillStop: vi.fn(),
    onClearFrom: vi.fn(),
    onMoveStop: vi.fn(),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TripPanel
        from={hotel}
        stops={[]}
        addStopRef={{ current: null }}
        near={null}
        {...handlers}
        {...props}
      />
    </QueryClientProvider>,
  );
  return handlers;
}

describe("TripPanel", () => {
  it("lists From and the stops, each with a Save star", () => {
    renderTrip({ stops: [{ key: "s1", place: konbini }] });
    const rows = within(
      screen.getByRole("list", { name: "Trip" }),
    ).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Hotel Hakuba"),
      expect.stringContaining("7-Eleven Happo"),
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

  it("✕ on each row: removes a stop, clears the start", () => {
    const h = renderTrip({ stops: [{ key: "s1", place: konbini }] });
    fireEvent.click(screen.getByRole("button", { name: "Remove stop 1" }));
    expect(h.onRemoveStop).toHaveBeenCalledWith("s1");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove starting point" }),
    );
    expect(h.onClearFrom).toHaveBeenCalled();
  });

  // SPEC-web-app v1.13 rule 6: the To box in the trip card is the only To
  it("has no To row: the box in the trip card is the destination", () => {
    renderTrip();
    expect(screen.getByRole("list", { name: "Trip" })).not.toHaveTextContent(
      "To:",
    );
  });

  it("shows the stops while the start is being changed", () => {
    renderTrip({ from: null, stops: [{ key: "s1", place: konbini }] });
    const rows = within(
      screen.getByRole("list", { name: "Trip" }),
    ).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Remove stop 1" }),
    ).toBeInTheDocument();
  });

  // T4 (docs/ux/google-maps-workflows.md): stops can be reordered without a drag. Review of
  // #117: the ends keep both buttons (one marked disabled), so a move to an end never removes
  // the button that has focus
  it("moves a stop up or down; at the ends that way is disabled, not removed", () => {
    const second = { ...konbini, id: "k2", name: "Lawson Hakuba" };
    const handlers = renderTrip({
      stops: [
        { key: "s1", place: konbini },
        { key: "s2", place: second },
      ],
    });
    const firstUp = screen.getByRole("button", { name: "Move stop 1 up" });
    expect(firstUp).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(firstUp);
    expect(handlers.onMoveStop).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Move stop 2 down" }),
    ).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "Move stop 1 down" }));
    expect(handlers.onMoveStop).toHaveBeenCalledWith("s1", 1);
    fireEvent.click(screen.getByRole("button", { name: "Move stop 2 up" }));
    expect(handlers.onMoveStop).toHaveBeenCalledWith("s2", -1);
  });

  // re-review of #117: React moves the focused row on Move down, and a moved element loses
  // focus; it goes back to the moved stop's button
  it("keeps focus on the moved stop's button after a real Move down", () => {
    const second = { ...konbini, id: "k2", name: "Lawson Hakuba" };
    function Reorderable() {
      const [stops, setStops] = useState<TripStop[]>([
        { key: "s1", place: konbini },
        { key: "s2", place: second },
      ]);
      return (
        <QueryClientProvider client={new QueryClient()}>
          <TripPanel
            from={hotel}
            stops={stops}
            addStopRef={{ current: null }}
            near={null}
            onRemoveStop={() => {}}
            onFillStop={() => {}}
            onClearFrom={() => {}}
            onMoveStop={(key, by) =>
              setStops((list) => {
                const i = list.findIndex((st) => st.key === key);
                const next = [...list];
                [next[i], next[i + by]] = [next[i + by], next[i]];
                return next;
              })
            }
          />
        </QueryClientProvider>
      );
    }
    render(<Reorderable />);
    const down = screen.getByRole("button", { name: "Move stop 1 down" });
    down.focus();
    fireEvent.click(down);
    expect(document.activeElement).toHaveAccessibleName("Move stop 2 down");
  });

  // review of #117: an open stop box is not a neighbour (it would renumber the list only)
  it("offers no reorder while a stop box is open", () => {
    renderTrip({
      stops: [
        { key: "s1", place: konbini },
        { key: "s2", place: { ...konbini, id: "k2", name: "Lawson" } },
        { key: "s3", place: null },
      ],
    });
    expect(screen.queryByRole("button", { name: /Move stop/ })).toBeNull();
  });

  it("offers no reorder for a single stop", () => {
    renderTrip({ stops: [{ key: "s1", place: konbini }] });
    expect(screen.queryByRole("button", { name: /Move stop/ })).toBeNull();
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
    const addStopRef = useRef<HTMLButtonElement>(null);
    return (
      <>
        {/* stands in for the button in the trip card */}
        {stops.every((s) => s.place !== null) && (
          <button
            ref={addStopRef}
            type="button"
            onClick={() =>
              setStops((l) => [...l, { key: `s${l.length + 1}`, place: null }])
            }
          >
            Add destination
          </button>
        )}
        <TripPanel
          from={hotel}
          stops={stops}
          addStopRef={addStopRef}
          near={null}
          onRemoveStop={(key) =>
            setStops((l) => l.filter((s) => s.key !== key))
          }
          onFillStop={(key, place) =>
            setStops((l) => l.map((s) => (s.key === key ? { ...s, place } : s)))
          }
          onClearFrom={() => {}}
        />
      </>
    );
  }

  it("fills the stop from a suggestion, then hands focus to Add destination (not to the page)", async () => {
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([sevenEleven]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Harness />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add destination" }));
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
    expect(
      screen.getByRole("button", { name: "Add destination" }),
    ).toHaveFocus();

    // removing it also keeps focus in the panel
    fireEvent.click(screen.getByRole("button", { name: "Remove stop 1" }));
    expect(
      screen.getByRole("button", { name: "Add destination" }),
    ).toHaveFocus();
  });
});

describe("TripPanel's Add destination slot (SPEC-web-app v1.18)", () => {
  it("shows the slot above the Trip list, where any number of stops can't push it under the ETA row", () => {
    const addStopRef = { current: null };
    const props = {
      stops: [],
      addStopRef,
      near: null,
      onRemoveStop: () => {},
      onFillStop: () => {},
      onClearFrom: () => {},
      addDestination: <button type="button">Add destination</button>,
    };
    const { rerender } = render(
      <QueryClientProvider client={new QueryClient()}>
        <TripPanel from={hotel} {...props} />
      </QueryClientProvider>,
    );
    const list = screen.getByRole("list", { name: "Trip" });
    const add = screen.getByRole("button", { name: "Add destination" });
    expect(
      add.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // the slot alone is enough to render the panel (a start being retyped keeps the stops)
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <TripPanel from={null} {...props} />
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Add destination" }),
    ).toBeVisible();
  });
});

describe("stops in the URL", () => {
  it("round-trips stops=lat,lng;lat,lng", () => {
    const view = parseViewState(
      "?from=36.697,137.854&mode=walk&stops=36.699,137.845;36.7,137.84",
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
    mode: "walk",
    durationS: 100,
    distanceM: 900,
    isEstimate: false,
    geometry: { type: "LineString", coordinates },
    steps: [
      step("Walk east.", "depart", 0, 3),
      step("Arrive at stop 1, on the right.", "arrive", 3, 3),
      step("Walk east.", "depart", 3, 6),
      step("Arrive at stop 2.", "arrive", 6, 6),
      step("Walk east.", "depart", 6, 9),
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
          step("Walk east.", "depart", 0, 6),
          step("Arrive at stop 1.", "arrive", 6, 6),
          step("Walk east.", "depart", 6, 9),
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
      "Walk east.",
      "Arrive at stop 3, on the right.",
      "Walk east.",
      "Arrive at stop 5.",
      "Walk east.",
      "You have arrived at your destination.",
    ]);
  });
});

// SPEC-web-app v1.8 rule 1 (BC-T1): in walk the To row is a search box that
// shows the destination's name; a pick there changes only the destination.
// v1.9: the To box lives in the trip card on top (DestinationBox), not in the trip list
describe("DestinationBox (the To box)", () => {
  const cortina: Suggestion = {
    id: "cortina",
    kind: "resort",
    name: "Hakuba Cortina Snow Resort",
    nameJa: null,
    coord: { lat: 36.777, lng: 137.888 },
    detail: "Ski resort",
    match: [7, 14],
    source: "index",
  };

  beforeEach(() => localStorage.clear()); // saved places and recents from other tests

  function renderToBox(to: PlaceInput | null, onChooseTo = vi.fn()) {
    const onClearTo = vi.fn();
    const client = new QueryClient();
    const box = (next: PlaceInput | null) => (
      <QueryClientProvider client={client}>
        <DestinationBox
          to={next}
          near={null}
          onChoose={onChooseTo}
          onClear={onClearTo}
        />
      </QueryClientProvider>
    );
    const view = render(box(to));
    const rerender = (next: { to: PlaceInput | null }) =>
      view.rerender(box(next.to));
    return { onChooseTo, onClearTo, rerender };
  }

  it("is a combobox named To that shows the destination, with a ✕", () => {
    const { onClearTo } = renderToBox(resort);
    const box = screen.getByRole("combobox", { name: "To" });
    expect(box).toHaveValue("Happo-One");
    expect(box).toHaveAttribute("placeholder", "Where to?"); // v1.18 (was "Search a destination")
    fireEvent.click(screen.getByRole("button", { name: "Remove destination" }));
    expect(onClearTo).toHaveBeenCalled();
  });

  it("is an empty box when there is no destination", () => {
    renderToBox(null);
    expect(screen.getByRole("combobox", { name: "To" })).toHaveValue("");
  });

  it("a pick in the To box goes to onChooseTo", async () => {
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([cortina]);
    const { onChooseTo } = renderToBox(resort);
    const box = screen.getByRole("combobox", { name: "To" });
    box.focus();
    fireEvent.change(box, { target: { value: "Cortina" } });
    const row = await screen.findByRole("option", { name: /Hakuba Cortina/ });
    fireEvent.mouseDown(row);
    fireEvent.click(row);
    expect(onChooseTo).toHaveBeenCalledWith(cortina);
  });

  it("follows the destination: a new one replaces the text, none empties it", () => {
    const { rerender } = renderToBox(resort);
    const box = screen.getByRole("combobox", { name: "To" });
    rerender({ to: { ...resort, id: "cortina", name: "Hakuba Cortina" } });
    expect(box).toHaveValue("Hakuba Cortina");
    rerender({ to: null });
    expect(screen.getByRole("combobox", { name: "To" })).toHaveValue("");
  });
});
