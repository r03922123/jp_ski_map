/**
 * Characterization tests for MapShell's state transitions (SPEC-refactor R3.1): they pin
 * today's behaviour so W2/W3 can split the component without changing it. Only the
 * edges are faked: the map (WebGL), the network (lib/api fetchers) and the pointer
 * media query; everything between them is the real MapShell.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapShell } from "@/components/MapShell";
import type MapView from "@/components/MapView";
import type { SkiLine, SkiLineFeature } from "@/components/map/SkiLinesLayer";
import type { Resort, Route } from "@/lib/api";
import * as api from "@/lib/api";
import { emptyState, savedStore, toggleInList } from "@/lib/saved-places";
import busFixture from "../e2e/fixtures/bus-options-2026-03-20.json";
import walkFixture from "./fixtures/route-walk.json";

type MapProps = ComponentProps<typeof MapView>;
// the props MapShell last gave the map: the test reads them and calls its callbacks
let mapProps: MapProps | null = null;
const map = () => {
  if (!mapProps) throw new Error("MapView not rendered");
  return mapProps;
};

// MapShell loads MapView through next/dynamic (WebGL); a stub records its props instead
vi.mock("next/dynamic", () => ({
  default: () => (props: MapProps) => {
    mapProps = props;
    return null;
  },
}));

const happo: Resort = {
  id: "happo-one",
  name: { en: "Hakuba Happo-One Snow Resort", ja: "白馬八方尾根スキー場" },
  region: "hakuba-valley",
  website: "https://www.happo-one.jp/en/",
  accessPoints: [
    {
      id: "happo-one-adam-gondola",
      name: { en: "Adam Gondola", ja: "八方ゴンドラ「アダム」" },
      coord: { lat: 36.70179, lng: 137.83683 },
      coordSource: "osm",
    },
  ],
  stats: {
    baseElevationM: 760,
    topElevationM: 1831,
    verticalM: 1071,
    gondolas: 1,
    chairLifts: 22,
    runs: 16,
    longestRunM: 8000,
    totalRunsM: 23300,
    areaHa: 220,
    terrainPct: { beginner: 30, intermediate: 50, advanced: 20 },
    nightSkiing: null,
    dayTicketJpy: null,
  },
  hakubaValleyPass: true,
  statsSource: "test",
};
// a Happo-One run as /api/ski-lines serves it: 3 heights 50 m apart, due north (v1.4)
const skyline: SkiLine = {
  id: "r1",
  kind: "run",
  name: "Skyline",
  difficulty: "easy",
  liftType: null,
  resortId: "happo-one",
  distanceM: 100,
  minElevationM: 1645,
  maxElevationM: 1672,
  slopePct: 27,
  durationS: null,
};
const skylineRun: SkiLineFeature = {
  type: "Feature",
  properties: {
    ...skyline,
    profile: { heightsM: [1672, 1660, 1645], resolutionM: 50 },
  },
  geometry: {
    type: "LineString",
    coordinates: [
      [137.8, 36.7],
      [137.8, 36.7009],
    ],
  },
};
// a Happo-One lift south-west of it, and another resort's run, for the resort's frame (v1.5)
const happoLift: SkiLineFeature = {
  type: "Feature",
  properties: {
    ...skyline,
    id: "l1",
    kind: "lift",
    name: "Alpen",
    difficulty: null,
    liftType: "chair_lift",
    profile: null,
  },
  geometry: {
    type: "LineString",
    coordinates: [
      [137.79, 36.69],
      [137.8, 36.7],
    ],
  },
};
const goryuRun: SkiLineFeature = {
  ...skylineRun,
  properties: { ...skylineRun.properties, id: "g1", resortId: "goryu" },
  geometry: {
    type: "LineString",
    coordinates: [
      [137.85, 36.66],
      [137.86, 36.67],
    ],
  },
};
// Happo-One's area run (a Polygon, as one run in the snapshot is), east of the others (v1.5)
const happoArea: SkiLineFeature = {
  type: "Feature",
  properties: {
    ...skyline,
    id: "a1",
    name: "Area",
    distanceM: null,
    minElevationM: null,
    maxElevationM: null,
    slopePct: null,
    profile: null,
  },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [137.805, 36.7],
        [137.81, 36.7],
        [137.81, 36.705],
        [137.805, 36.7],
      ],
    ],
  },
};
const walk = walkFixture as unknown as Route;
const hotel = { lat: 36.697364, lng: 137.853928 };

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    resortsQuery: {
      queryKey: ["resorts"],
      queryFn: async () => [happo],
      staleTime: Number.POSITIVE_INFINITY,
    },
    fetchRank: vi.fn(async () => []),
    fetchRoutes: vi.fn(),
    fetchPath: vi.fn(),
    fetchSuggestions: vi.fn(async () => []),
    // typed, so a fake that drifts from the API shape fails typecheck, not BusPanel
    fetchBusOptions: vi.fn(
      async (): Promise<api.BusResult> => ({
        status: "ok",
        nextServiceDate: null,
        resorts: [],
        basis: "published",
        newerSourcePending: false,
      }),
    ),
    fetchLodging: vi.fn(async () => []),
    fetchNearbyPois: vi.fn(async () => []),
    skiLinesQuery: {
      queryKey: ["ski-lines"],
      queryFn: async () => ({
        features: [skylineRun, happoLift, goryuRun, happoArea],
      }),
      staleTime: Number.POSITIVE_INFINITY,
    },
  };
});

/** The page's query string, as the URL mirror wrote it. */
const query = () => new URLSearchParams(window.location.search);

function renderShell(search = "") {
  window.history.replaceState(null, "", `/${search}`);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MapShell />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mapProps = null;
  localStorage.clear();
  savedStore.update(() => emptyState()); // the store keeps its state in memory
  // a phone: Start is offered on touch-first devices only (SPEC-pilot "Devices")
  vi.stubGlobal(
    "matchMedia",
    (q: string) =>
      ({
        matches: q === "(pointer: coarse)",
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  // set per test; reset here so one test's answer never leaks into the next
  vi.mocked(api.fetchPath).mockReset();
  vi.mocked(api.fetchSuggestions).mockResolvedValue([]);
  vi.mocked(api.fetchRank).mockResolvedValue([]);
  vi.mocked(api.fetchRoutes).mockResolvedValue({
    primary: walk,
    alternates: [],
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("MapShell origin", () => {
  it("a dropped pin's Start here sets the origin, the link and the From box", async () => {
    renderShell();
    expect(map().origin).toBeNull();
    act(() => map().onDropPin?.(hotel, null));
    fireEvent.click(screen.getByRole("button", { name: "Start here" }));
    expect(map().origin).toEqual(hotel);
    await waitFor(() => expect(query().get("from")).toBe("36.69736,137.85393"));
    expect(screen.getByDisplayValue("Dropped pin")).toBeInTheDocument();
  });

  it("a shared link restores the origin", async () => {
    renderShell("?from=36.69736,137.85393&mode=walk&resort=happo-one");
    await waitFor(() => expect(map().destination).not.toBeNull());
    expect(map().origin).toEqual({ lat: 36.69736, lng: 137.85393 });
  });

  it("clearing the start empties the origin and drops it from the link", async () => {
    renderShell("?from=36.69736,137.85393&mode=walk");
    await waitFor(() => expect(map().origin).not.toBeNull());
    fireEvent.click(
      screen.getByRole("button", { name: "Clear starting point" }),
    );
    expect(map().origin).toBeNull();
    await waitFor(() => expect(query().get("from")).toBeNull());
  });
});

describe("MapShell destination", () => {
  it("choosing a resort targets its access point and asks for the route", async () => {
    renderShell("?from=36.69736,137.85393&mode=walk");
    await waitFor(() => expect(map().resorts).toHaveLength(1));
    act(() => map().onSelectResort("happo-one"));
    expect(map().destination).toEqual(happo.accessPoints[0].coord);
    await waitFor(() => expect(query().get("resort")).toBe("happo-one"));
    await waitFor(() => expect(map().routes).toEqual([walk]));
    expect(api.fetchRoutes).toHaveBeenCalledWith(
      "walk",
      { lat: 36.69736, lng: 137.85393 },
      happo.accessPoints[0].coord,
    );
  });

  // review of #115: a pin on a saved place (a lodging pin of My hotel) is that place
  it("a pin dropped on a saved place shows it as saved", async () => {
    const hotelPlace = {
      id: "osm-node-1",
      name: "Hotel Hakuba",
      coord: { lat: 36.68, lng: 137.86 },
      kind: "lodging" as const,
    };
    savedStore.update((s) => toggleInList(s, hotelPlace, "starred"));
    renderShell("?from=36.69736,137.85393&mode=walk&resort=happo-one");
    await waitFor(() => expect(map().destination).not.toBeNull());
    act(() => map().onDropPin?.(hotelPlace.coord, "Hotel Hakuba"));
    const card = screen
      .getAllByRole("group", { name: "Hotel Hakuba" })
      .find((g) => g.tagName === "FIELDSET");
    if (!card) throw new Error("no pin card");
    expect(
      within(card).getByRole("button", { name: "Saved: Hotel Hakuba" }),
    ).toBeInTheDocument();
  });

  // SPEC-ski-runs v1.1: one card at a time; a tap elsewhere closes a run's card
  it("a run's card replaces the pin card, and a tap elsewhere on the map closes it", async () => {
    renderShell("?mode=walk");
    await waitFor(() => expect(mapProps).not.toBeNull());
    act(() => map().onDropPin?.({ lat: 36.7, lng: 137.85 }, null));
    expect(screen.getByRole("group", { name: "Dropped pin" })).toBeTruthy();
    act(() =>
      map().onSelectSkiLine?.({
        id: "r1",
        kind: "run",
        name: "Skyline",
        difficulty: "easy",
        liftType: null,
        resortId: "happo-one",
        distanceM: null,
        minElevationM: null,
        maxElevationM: null,
        slopePct: null,
        durationS: null,
      }),
    );
    expect(screen.queryByRole("group", { name: "Dropped pin" })).toBeNull();
    expect(screen.getByRole("group", { name: "Skyline" })).toBeTruthy();
    expect(map().selectedSkiLineId).toBe("r1");
    act(() => map().onMapTap?.());
    expect(screen.queryByRole("group", { name: "Skyline" })).toBeNull();
    expect(map().selectedSkiLineId).toBeNull();
  });

  // T2: a dropped pin can be saved from its card, like any place
  it("a dropped pin's card offers Save, which opens the list picker", async () => {
    renderShell("?from=36.69736,137.85393&mode=walk&resort=happo-one");
    await waitFor(() => expect(map().destination).not.toBeNull());
    act(() => map().onDropPin?.({ lat: 36.68, lng: 137.86 }, null));
    // the start (from a link's coordinates) is a "Dropped pin" too: look inside the card
    const card = screen
      .getAllByRole("group", { name: "Dropped pin" })
      .find((g) => g.tagName === "FIELDSET");
    if (!card) throw new Error("no pin card");
    fireEvent.click(
      within(card).getByRole("button", { name: "Save Dropped pin" }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("a pin's Go here makes the pin the destination instead of the resort", async () => {
    renderShell("?from=36.69736,137.85393&mode=walk&resort=happo-one");
    await waitFor(() => expect(map().destination).not.toBeNull());
    const pin = { lat: 36.68, lng: 137.86 };
    act(() => map().onDropPin?.(pin, null));
    fireEvent.click(screen.getByRole("button", { name: /go here/i }));
    expect(map().destination).toEqual(pin);
    await waitFor(() =>
      expect(query().get("dest")).toBe("pt:36.68000,137.86000"),
    );
  });
});

describe("MapShell mode", () => {
  it("switching from Bus to Walk shows the route on foot and writes the mode to the link", async () => {
    renderShell("?from=36.69736,137.85393&mode=bus&resort=happo-one");
    await waitFor(() => expect(api.fetchBusOptions).toHaveBeenCalled());
    expect(map().routes).toEqual([]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: /walk/i }));
    fireEvent.click(screen.getByRole("tab", { name: /walk/i }));
    await waitFor(() => expect(query().get("mode")).toBe("walk"));
    await waitFor(() => expect(map().routes).toEqual([walk]));
    expect(api.fetchRoutes).toHaveBeenLastCalledWith(
      "walk",
      expect.anything(),
      expect.anything(),
    );
  });

  // v1.24 (BC-L1, BC-L2): like Google's mode row, each tab shows its own time
  it("only the Walk tab shows a time to the resort", async () => {
    renderShell("?from=36.69736,137.85393&mode=walk&resort=happo-one");
    // walk 686 s in the fixture
    await waitFor(() => expect(map().routes).toEqual([walk]));
    expect(
      await screen.findByRole("tab", { name: /Walk 11 min/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Bus" })).toBeInTheDocument();
    // the Walk tab's time and the panel's route are one request
    expect(api.fetchRoutes).toHaveBeenCalledTimes(1);
  });

  // review of #106: Walk goes to the ranking's nearest entrance, so until the ranking
  // answers, a two-entrance resort's route is to the first one and its time may be wrong
  it("a two-entrance resort shows no time on the Walk tab until the ranking answers", async () => {
    const second = { ...happo.accessPoints[0], id: "happo-one-second" };
    happo.accessPoints.push(second);
    vi.mocked(api.fetchRank).mockReturnValue(new Promise(() => {}));
    try {
      renderShell("?from=36.69736,137.85393&mode=walk&resort=happo-one");
      await waitFor(() => expect(map().routes).toEqual([walk]));
      expect(screen.getByRole("tab", { name: "Walk" })).toBeInTheDocument();
    } finally {
      happo.accessPoints.pop();
    }
  });

  // re-review of #106: the ranking keeps the old start's answer as placeholder data
  it("a two-entrance resort hides the Walk time again when the start moves", async () => {
    const second = { ...happo.accessPoints[0], id: "happo-one-second" };
    happo.accessPoints.push(second);
    try {
      renderShell("?from=36.69736,137.85393&mode=walk&resort=happo-one");
      // the ranking for this start has loaded: the Walk route goes to its entrance
      expect(
        await screen.findByRole("tab", { name: /Walk 11 min/ }),
      ).toBeInTheDocument();
      // the new start's ranking hasn't answered yet
      vi.mocked(api.fetchRank).mockReturnValue(new Promise(() => {}));
      fireEvent.click(
        screen.getByRole("button", { name: "Clear starting point" }),
      );
      act(() => map().onDropPin?.({ lat: 36.69, lng: 137.86 }, null));
      fireEvent.click(screen.getByRole("button", { name: "Start here" }));
      await waitFor(() =>
        expect(map().origin).toEqual({ lat: 36.69, lng: 137.86 }),
      );
      await waitFor(() =>
        expect(
          vi
            .mocked(api.fetchRoutes)
            .mock.calls.some((c) => c[1].lat === 36.69 && c[0] === "walk"),
        ).toBe(true),
      );
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.getByRole("tab", { name: "Walk" })).toBeInTheDocument();
    } finally {
      happo.accessPoints.pop();
    }
  });

  it("a Food place shows no time on the Walk tab", async () => {
    const ramen = { lat: 36.699, lng: 137.84 };
    vi.mocked(api.fetchNearbyPois).mockResolvedValue([
      {
        id: "osm:node/1",
        category: "food",
        name: "Ramen",
        nameJa: null,
        coord: ramen,
        brand: null,
        cuisine: "ramen",
        openingHours: null,
        durationS: 300,
        distanceM: 2000,
      } as api.NearbyPoi,
    ]);
    renderShell(
      "?from=36.69736,137.85393&mode=walk&cat=food&dest=poi:osm:node/1",
    );
    await waitFor(() => expect(map().destination).toEqual(ramen));
    await waitFor(() => expect(map().routes).toEqual([walk]));
    expect(screen.getByRole("tab", { name: "Walk" })).toBeInTheDocument();
  });

  it("switching to Bus drops the walk route target: the map gets no destination", async () => {
    renderShell("?from=36.69736,137.85393&mode=walk&resort=happo-one");
    await waitFor(() => expect(map().destination).not.toBeNull());
    fireEvent.mouseDown(screen.getByRole("tab", { name: /bus/i }));
    fireEvent.click(screen.getByRole("tab", { name: /bus/i }));
    await waitFor(() => expect(query().get("mode")).toBe("bus"));
    expect(map().destination).toBeNull();
    expect(api.fetchBusOptions).toHaveBeenCalled();
    // the bus panel shows the (empty) answer
    expect(
      await screen.findByText("No more departures after this time today."),
    ).toBeInTheDocument();
  });

  // UX panel 2026-11-23: a bus tapped with no destination set named Happo-One in the To
  // box, but the link had no resort and Walk had no destination
  it("a tapped bus's resort stays the destination in the link and on Walk", async () => {
    vi.mocked(api.fetchBusOptions).mockResolvedValue({
      ...(busFixture as api.BusResult),
      resorts: (busFixture as api.BusResult).resorts.filter(
        (r) => r.resortId === happo.id,
      ),
    });
    renderShell("?from=36.69736,137.85393&mode=bus");
    const [option] = await screen.findAllByRole("button", { name: /Board/ });
    fireEvent.click(option);
    expect(await screen.findByRole("combobox", { name: "To" })).toHaveValue(
      happo.name.en,
    );

    await waitFor(() => expect(query().get("resort")).toBe(happo.id));
    fireEvent.mouseDown(screen.getByRole("tab", { name: /walk/i }));
    fireEvent.click(screen.getByRole("tab", { name: /walk/i }));
    await waitFor(() => expect(query().get("mode")).toBe("walk"));
    await waitFor(() =>
      expect(map().destination).toEqual(happo.accessPoints[0].coord),
    );
    expect(
      await screen.findByRole("tab", { name: /Walk 11 min/ }),
    ).toBeInTheDocument();

    // a new start keeps the destination listed (SPEC-web-app "the stops and the destination stay")
    fireEvent.click(
      screen.getByRole("button", { name: "Clear starting point" }),
    );
    await waitFor(() => expect(query().get("from")).toBeNull());
    expect(query().get("resort")).toBe(happo.id);
  });

  it("a tapped bus doesn't narrow the Bus list to its resort (v1.13 rule 6)", async () => {
    vi.mocked(api.fetchBusOptions).mockResolvedValue(
      busFixture as api.BusResult,
    );
    renderShell("?from=36.69736,137.85393&mode=bus");
    const boards = () => screen.getAllByRole("button", { name: /Board/ });
    await waitFor(() => expect(boards().length).toBeGreaterThan(3));
    const listed = boards().length;
    const [happoBus] = within(
      screen.getByRole("region", { name: happo.name.en }),
    ).getAllByRole("button", { name: /Board/ });
    fireEvent.click(happoBus);
    expect(await screen.findByRole("combobox", { name: "To" })).toHaveValue(
      happo.name.en,
    );
    // one resort has 3 options in the fixture: narrowed, the other resorts' buses would go
    expect(boards().length).toBeGreaterThanOrEqual(listed - 1);
  });

  it("Directions after a tapped bus makes the start the only destination", async () => {
    vi.mocked(api.fetchBusOptions).mockResolvedValue({
      ...(busFixture as api.BusResult),
      resorts: (busFixture as api.BusResult).resorts.filter(
        (r) => r.resortId === happo.id,
      ),
    });
    // with the Food list open, Walk has no destination, so the start's card offers Directions
    renderShell("?from=36.69736,137.85393&mode=bus&cat=food");
    const [option] = await screen.findAllByRole("button", { name: /Board/ });
    fireEvent.click(option);
    await waitFor(() => expect(query().get("resort")).toBe(happo.id));
    fireEvent.mouseDown(screen.getByRole("tab", { name: /walk/i }));
    fireEvent.click(screen.getByRole("tab", { name: /walk/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Directions" }));
    await waitFor(() => expect(query().get("dest")).toMatch(/^pt:/));
    expect(query().get("resort")).toBeNull();
  });
});

describe("MapShell pilot", () => {
  it("Start hands the route to the pilot; Exit returns to the planner", async () => {
    const { container } = renderShell(
      "?from=36.69736,137.85393&mode=walk&resort=happo-one",
    );
    const main = () => container.querySelector("main") as HTMLElement;
    fireEvent.click(
      await screen.findByRole("button", { name: /start navigation/i }),
    );
    expect(main().dataset.piloting).toBe("true");
    expect(map().routes).toEqual([walk]);
    expect(map().pilot).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: /start navigation/i }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Exit navigation" }));
    expect(main().dataset.piloting).toBe("false");
    expect(map().pilot).toBeNull();
    expect(
      screen.getByRole("button", { name: /start navigation/i }),
    ).toBeInTheDocument();
  });
});

// W2 adds these before moving the code they cover (W1's PR listed them as not covered)
const from = "36.69736,137.85393";
const fromCoord = { lat: 36.69736, lng: 137.85393 };
const gondola = happo.accessPoints[0].coord;

describe("MapShell search box", () => {
  it("picking a search result sets the origin, flies there and writes the link", async () => {
    const station: api.Suggestion = {
      id: "jr-hakuba",
      kind: "place",
      name: "JR Hakuba Station",
      nameJa: null,
      coord: { lat: 36.69877, lng: 137.86197 },
      detail: null,
      match: null,
      source: "test",
    };
    vi.mocked(api.fetchSuggestions).mockResolvedValue([station]);
    renderShell();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Search hotel or place" }),
      { target: { value: "hakuba st" } },
    );
    fireEvent.click(
      await screen.findByRole("option", { name: /JR Hakuba Station/ }),
    );
    expect(map().origin).toEqual(station.coord);
    expect(map().flyTo).toEqual(station.coord);
    await waitFor(() => expect(query().get("from")).toBe("36.69877,137.86197"));
  });
});

describe("MapShell swap", () => {
  it("swap makes the resort the start and the start a point; a second swap restores the resort", async () => {
    renderShell(`?from=${from}&mode=walk&resort=happo-one`);
    await waitFor(() => expect(map().destination).not.toBeNull());
    const swap = () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Swap start and destination" }),
      );
    swap();
    expect(map().origin).toEqual(gondola);
    expect(map().destination).toEqual(fromCoord);
    await waitFor(() => expect(query().get("dest")).toBe(`pt:${from}`));
    expect(query().get("resort")).toBeNull();
    swap();
    expect(map().origin).toEqual(fromCoord);
    await waitFor(() => expect(query().get("resort")).toBe("happo-one"));
    expect(map().destination).toEqual(gondola);
  });
});

describe("MapShell stops", () => {
  // T4: reordering stops changes the route's order and the shared link
  it("Move down swaps two stops in the route and the link", async () => {
    vi.mocked(api.fetchPath).mockResolvedValue(walk);
    const a = { lat: 36.69, lng: 137.84 };
    const b = { lat: 36.695, lng: 137.845 };
    renderShell(
      `?from=${from}&mode=walk&resort=happo-one&stops=36.69000,137.84000;36.69500,137.84500`,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Move stop 1 down" }),
    );
    await waitFor(() =>
      expect(query().get("stops")).toBe(
        "36.69500,137.84500;36.69000,137.84000",
      ),
    );
    await waitFor(() =>
      expect(api.fetchPath).toHaveBeenCalledWith(
        "walk",
        [fromCoord, b, a, gondola],
        {
          stopAtPoints: true,
        },
      ),
    );
  });

  it("Add destination opens a stop box that takes the next map tap; the route goes through it", async () => {
    vi.mocked(api.fetchPath).mockResolvedValue(walk);
    renderShell(`?from=${from}&mode=walk&resort=happo-one`);
    fireEvent.click(
      await screen.findByRole("button", { name: /add destination/i }),
    );
    expect(map().placingStop).toBe(true);
    const stop = { lat: 36.69, lng: 137.84 };
    act(() => map().onPickOrigin(stop));
    expect(map().origin).toEqual(fromCoord); // the tap filled the stop, not the start
    expect(map().placingStop).toBe(false);
    expect(map().stops).toEqual([{ coord: stop, name: "Dropped pin" }]);
    await waitFor(() =>
      expect(query().get("stops")).toBe("36.69000,137.84000"),
    );
    await waitFor(() =>
      expect(api.fetchPath).toHaveBeenCalledWith(
        "walk",
        [fromCoord, stop, gondola],
        { stopAtPoints: true },
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove stop 1" }));
    expect(map().stops).toEqual([]);
    await waitFor(() => expect(query().get("stops")).toBeNull());
  });
});

describe("MapShell saved panel", () => {
  const onsen = {
    id: "onsen",
    name: "Onsen",
    coord: { lat: 36.7, lng: 137.85 },
    kind: "poi" as const,
  };
  const savedButton = () =>
    screen.getByRole("button", { name: "Saved places" });
  const onsenCard = () => screen.getByRole("listitem", { name: "Onsen" });

  // review of #118: the import notice goes once Saved closes, by any route
  it("the import notice is gone after Saved closes through its toggle", async () => {
    const code = btoa(
      JSON.stringify({
        v: 1,
        n: "Onsen trip",
        i: "bookmark",
        p: [["osm-node-7", "Mimizuku no Yu", 36.69735, 137.84402, "poi"]],
      }),
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    renderShell(`#import=${code}`);
    fireEvent.click(
      await screen.findByRole("button", { name: "Add to Saved" }),
    );
    const panel = await screen.findByRole("region", { name: "Saved" });
    expect(within(panel).getByRole("status")).toHaveTextContent(
      "Added 1 place to “Onsen trip”",
    );
    fireEvent.click(savedButton());
    fireEvent.click(savedButton());
    const again = await screen.findByRole("region", { name: "Saved" });
    expect(within(again).queryByRole("status")).toBeNull();
  });

  it("Go here makes a saved place the destination and closes the panel", async () => {
    savedStore.update((s) => toggleInList(s, onsen, "starred"));
    renderShell(`?from=${from}&mode=walk`);
    act(() => map().onSelectSaved?.("onsen")); // a tapped saved marker opens on it
    expect(savedButton()).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      within(onsenCard()).getByRole("button", { name: "Go here" }),
    );
    expect(map().destination).toEqual(onsen.coord);
    expect(savedButton()).toHaveAttribute("aria-pressed", "false");
    await waitFor(() =>
      expect(query().get("dest")).toBe("pt:36.70000,137.85000"),
    );
  });

  it("Start from here makes a saved place the start and flies there", async () => {
    savedStore.update((s) => toggleInList(s, onsen, "starred"));
    renderShell();
    act(() => map().onSelectSaved?.("onsen"));
    fireEvent.click(
      within(onsenCard()).getByRole("button", { name: "Start from here" }),
    );
    expect(map().origin).toEqual(onsen.coord);
    expect(map().flyTo).toEqual(onsen.coord);
    expect(savedButton()).toHaveAttribute("aria-pressed", "false");
  });

  it("the Saved button toggles the panel in place of the trip lists", async () => {
    renderShell(`?from=${from}&mode=walk`);
    expect(screen.queryByRole("region", { name: "Saved" })).toBeNull();
    fireEvent.click(savedButton());
    expect(screen.getByRole("region", { name: "Saved" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /walk/i })).toBeNull();
    fireEvent.click(savedButton());
    expect(screen.queryByRole("region", { name: "Saved" })).toBeNull();
  });
});

// a11y review (keyboard and screen reader): a pick must leave focus where the answer is
describe("MapShell keyboard focus", () => {
  const ranked: api.RankedResort = {
    resortId: "happo-one",
    name: "Hakuba Happo-One Snow Resort",
    rank: 1,
    sortValue: 463,
    walkS: 463,
    walkDistanceM: 2500,
    accessPointId: "happo-one-adam-gondola",
    factors: {
      walkTime: 463,
      freshSnow: null,
      snowDepth: null,
      crowd: null,
      terrainSize: null,
      vertical: null,
      price: null,
    },
    snow: null,
    crowd: null,
    statsSource: "test",
    website: "https://www.happo-one.jp/",
  };
  const eta = () => screen.findByText(/^ETA ~/);

  it("a resort picked from the ranked list hands focus to its ETA, which is announced", async () => {
    vi.mocked(api.fetchRank).mockResolvedValue([ranked]);
    renderShell(`?from=${from}&mode=walk`);
    const card = within(
      await screen.findByRole("list", { name: "Ranked resorts" }),
    ).getByRole("button", { name: /Happo-One/ });
    card.focus();
    fireEvent.click(card); // Enter on a focused button
    await waitFor(async () => expect(await eta()).toHaveFocus());
    expect(await eta()).toHaveAttribute("aria-live", "polite");
  });

  it("Walk still offers the resort picker when the ranking fails", async () => {
    vi.mocked(api.fetchRank).mockRejectedValue(new Error("routing busy"));
    renderShell(`?from=${from}&mode=walk`);
    const picker = await screen.findByRole("combobox", { name: "Resort" });
    fireEvent.change(picker, { target: { value: "happo-one" } });
    await waitFor(() => expect(query().get("resort")).toBe("happo-one"));
  });

  it("a resort tapped on the map leaves focus where it was", async () => {
    renderShell(`?from=${from}&mode=walk`);
    await waitFor(() => expect(map().resorts).toHaveLength(1));
    act(() => map().onSelectResort("happo-one"));
    await eta();
    expect(document.body).toHaveFocus();
  });

  it("a mode tab keeps focus when its route appears below it", async () => {
    renderShell(`?from=${from}&mode=bus&resort=happo-one`);
    const walkTab = await screen.findByRole("tab", { name: /Walk 11 min/ });
    walkTab.focus();
    fireEvent.mouseDown(walkTab);
    fireEvent.click(walkTab);
    await eta();
    expect(walkTab).toHaveFocus();
  });

  it("Directions makes the start the destination and puts focus in the empty start box", async () => {
    renderShell(`?from=${from}&mode=walk`);
    const directions = await screen.findByRole("button", {
      name: "Directions",
    });
    directions.focus();
    fireEvent.click(directions);
    const start = screen.getByRole("combobox", {
      name: "Search hotel or place",
    });
    expect(start).toHaveValue("");
    expect(start).toHaveFocus();
  });

  it("the start box takes focus once: it stays unfocused when it returns after navigation", async () => {
    renderShell(`?from=${from}&mode=walk`);
    fireEvent.click(await screen.findByRole("button", { name: "Directions" }));
    (document.activeElement as HTMLElement).blur();
    act(() => map().onDropPin?.({ lat: 36.69, lng: 137.86 }, null));
    fireEvent.click(screen.getByRole("button", { name: "Start here" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /start navigation/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Exit navigation" }));
    expect(
      await screen.findByRole("combobox", { name: "Search hotel or place" }),
    ).not.toHaveFocus();
  });
});

// SPEC-ski-runs v1.4: the resort card, and the run card's height profile on the map
describe("MapShell ski cards", () => {
  const resortCard = () =>
    screen.queryByRole("group", { name: "Hakuba Happo-One Snow Resort" });

  it("a tapped resort chip opens the resort card and still picks the resort", async () => {
    renderShell(`?from=${from}&mode=walk`);
    await waitFor(() => expect(map().resorts).toHaveLength(1));
    act(() => map().onSelectResort("happo-one"));
    expect(map().destination).toEqual(gondola);
    expect(resortCard()).not.toBeNull();
    // the numbers come from the resort's own lines, once they load
    expect(await screen.findByText("Downhill runs")).toBeInTheDocument();
    expect(map().selectedSkiResortId).toBe("happo-one");
    fireEvent.click(
      within(resortCard() as HTMLElement).getByRole("button", {
        name: "Close",
      }),
    );
    expect(resortCard()).toBeNull();
    expect(map().selectedSkiResortId).toBeNull();
  });

  it("with a stop box open, a resort chip fills the stop and opens no card", async () => {
    renderShell(`?from=${from}&mode=walk&resort=happo-one`);
    fireEvent.click(
      await screen.findByRole("button", { name: /add destination/i }),
    );
    act(() => map().onSelectResort("happo-one"));
    expect(map().stops).toEqual([
      { coord: gondola, name: "Hakuba Happo-One Snow Resort" },
    ]);
    expect(resortCard()).toBeNull();
  });

  it("the run card's resort name opens the resort card", async () => {
    renderShell("?mode=walk");
    await waitFor(() => expect(map().resorts).toHaveLength(1));
    act(() => map().onSelectSkiLine?.(skyline));
    fireEvent.click(
      screen.getByRole("button", { name: "Hakuba Happo-One Snow Resort" }),
    );
    expect(screen.queryByRole("group", { name: "Skyline" })).toBeNull();
    expect(resortCard()).not.toBeNull();
    // the button that had focus is gone: focus moves into the card that replaced it
    expect(
      within(resortCard() as HTMLElement).getByRole("button", {
        name: "Close",
      }),
    ).toHaveFocus();
  });

  it("a resort chip tap leaves focus where it was", async () => {
    renderShell("?mode=walk");
    await waitFor(() => expect(map().resorts).toHaveLength(1));
    act(() => map().onSelectResort("happo-one"));
    expect(resortCard()).not.toBeNull();
    expect(
      within(resortCard() as HTMLElement).getByRole("button", {
        name: "Close",
      }),
    ).not.toHaveFocus();
  });

  // v1.5: the map frames what the card is about, once its whole lines have loaded (a tap's
  // own geometry is tile-clipped)
  it("a tapped run frames its whole line, a resort card all the resort's lines", async () => {
    renderShell("?mode=walk");
    await waitFor(() => expect(map().resorts).toHaveLength(1));
    act(() => map().onSelectSkiLine?.(skyline));
    await waitFor(() =>
      expect(map().skiFocus).toEqual({
        key: "r1",
        bounds: [
          [137.8, 36.7],
          [137.8, 36.7009],
        ],
      }),
    );
    act(() => map().onSelectResort("happo-one"));
    // the run, the lift and the area's outline, not Goryu's run
    expect(map().skiFocus).toEqual({
      key: "resort:happo-one",
      bounds: [
        [137.79, 36.69],
        [137.81, 36.705],
      ],
    });
    fireEvent.click(
      within(resortCard() as HTMLElement).getByRole("button", {
        name: "Close",
      }),
    );
    expect(map().skiFocus).toBeNull();
    // a dropped pin's card frames nothing (the map eases to the pin instead)
    act(() => map().onDropPin?.({ lat: 36.7, lng: 137.85 }, null));
    expect(map().skiFocus).toBeNull();
  });

  it("while navigating, the map frames no ski card; on exit it frames it again", async () => {
    renderShell("?from=36.69736,137.85393&mode=walk&resort=happo-one");
    await waitFor(() => expect(map().resorts).toHaveLength(1));
    act(() => map().onSelectSkiLine?.(skyline));
    await waitFor(() => expect(map().skiFocus?.key).toBe("r1"));
    fireEvent.click(
      await screen.findByRole("button", { name: /start navigation/i }),
    );
    expect(map().skiFocus).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Exit navigation" }));
    expect(map().skiFocus?.key).toBe("r1");
  });

  it("moving over the run's profile puts the ring on the map; closing the card clears it", async () => {
    renderShell("?mode=walk");
    await waitFor(() => expect(mapProps).not.toBeNull());
    act(() => map().onSelectSkiLine?.(skyline));
    const chart = await screen.findByRole("slider", {
      name: "Height profile",
    });
    chart.getBoundingClientRect = () =>
      ({ left: 0, width: 200, top: 0, height: 80 }) as DOMRect;
    fireEvent.pointerMove(chart, { clientX: 200, clientY: 10 });
    expect(map().profilePoint?.lat).toBeCloseTo(36.7009, 6);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(map().profilePoint).toBeNull();
  });
});
