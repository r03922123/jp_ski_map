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
import type { Resort, Route } from "@/lib/api";
import * as api from "@/lib/api";
import { emptyState, savedStore, toggleInList } from "@/lib/saved-places";
import busFixture from "../e2e/fixtures/bus-options-2026-03-20.json";
import driveFixture from "./fixtures/route-drive.json";
import walkFixture from "./fixtures/route-walk.json";

type MapProps = ComponentProps<typeof MapView>;
// the props MapShell last gave the map: the test reads them and calls its callbacks
let mapProps: MapProps | null = null;
const map = () => {
  if (!mapProps) throw new Error("MapView not rendered");
  return mapProps;
};

// MapShell loads MapView through next/dynamic (WebGL); a stub records its props instead,
// and shows the pin card MapView would anchor to the pin
vi.mock("next/dynamic", () => ({
  default: () => (props: MapProps) => {
    mapProps = props;
    return props.pinCard ?? null;
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
const drive = driveFixture as unknown as Route;
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
  vi.mocked(api.fetchRoutes).mockImplementation(async (mode) => ({
    primary: mode === "drive" ? drive : walk,
    alternates: [],
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("MapShell origin", () => {
  it("a map tap with no start sets the origin, the link and the From box", async () => {
    renderShell();
    expect(map().origin).toBeNull();
    act(() => map().onPickOrigin(hotel));
    expect(map().origin).toEqual(hotel);
    await waitFor(() => expect(query().get("from")).toBe("36.69736,137.85393"));
    expect(screen.getAllByText("Dropped pin").length).toBeGreaterThan(0);
  });

  it("a shared link restores the origin, and a tap with both ends set keeps it", async () => {
    renderShell("?from=36.69736,137.85393&mode=drive&resort=happo-one");
    await waitFor(() => expect(map().destination).not.toBeNull());
    act(() => map().onPickOrigin({ lat: 36.6, lng: 137.8 }));
    expect(map().origin).toEqual({ lat: 36.69736, lng: 137.85393 });
  });

  it("clearing the start empties the origin and drops it from the link", async () => {
    renderShell("?from=36.69736,137.85393&mode=drive");
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
    renderShell("?from=36.69736,137.85393&mode=drive");
    await waitFor(() => expect(map().resorts).toHaveLength(1));
    act(() => map().onSelectResort("happo-one"));
    expect(map().destination).toEqual(happo.accessPoints[0].coord);
    await waitFor(() => expect(query().get("resort")).toBe("happo-one"));
    await waitFor(() => expect(map().routes).toEqual([drive]));
    // v1.24: the Walk tab's time is asked for too, so drive is not always the last call
    expect(api.fetchRoutes).toHaveBeenCalledWith(
      "drive",
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
    renderShell("?from=36.69736,137.85393&mode=drive&resort=happo-one");
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

  // T2: a dropped pin can be saved from its card, like any place
  it("a dropped pin's card offers Save, which opens the list picker", async () => {
    renderShell("?from=36.69736,137.85393&mode=drive&resort=happo-one");
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
    renderShell("?from=36.69736,137.85393&mode=drive&resort=happo-one");
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
  it("switching to Walk re-asks the route on foot and writes the mode to the link", async () => {
    renderShell("?from=36.69736,137.85393&mode=drive&resort=happo-one");
    await waitFor(() => expect(map().routes).toEqual([drive]));
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
  it("the Drive and Walk tabs show each mode's time to the resort", async () => {
    renderShell("?from=36.69736,137.85393&mode=drive&resort=happo-one");
    // drive 463 s, walk 686 s in the fixtures
    await waitFor(() => expect(map().routes).toEqual([drive]));
    expect(
      await screen.findByRole("tab", { name: /Drive 8 min/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("tab", { name: /Walk 11 min/ }),
    ).toBeInTheDocument();
    // the Drive tab's time and the panel's route are one request
    const driveCalls = vi
      .mocked(api.fetchRoutes)
      .mock.calls.filter((c) => c[0] === "drive");
    expect(driveCalls).toHaveLength(1);
  });

  // review of #106: Drive goes to the ranking's nearest entrance, Walk (with no ranking
  // yet) to the first, so a two-entrance resort's tab time would be for another place
  it("a two-entrance resort with no ranking yet shows no times on the tabs", async () => {
    const second = { ...happo.accessPoints[0], id: "happo-one-second" };
    happo.accessPoints.push(second);
    try {
      renderShell("?from=36.69736,137.85393&mode=walk&resort=happo-one");
      await waitFor(() => expect(map().routes).toEqual([walk]));
      expect(screen.getByRole("tab", { name: "Drive" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Walk" })).toBeInTheDocument();
    } finally {
      happo.accessPoints.pop();
    }
  });

  // re-review of #106: the ranking keeps the old start's answer as placeholder data
  it("a two-entrance resort hides the times again when the start moves in Walk", async () => {
    const second = { ...happo.accessPoints[0], id: "happo-one-second" };
    happo.accessPoints.push(second);
    try {
      renderShell("?from=36.69736,137.85393&mode=drive&resort=happo-one");
      // the ranking for this start has loaded: one place for every mode
      expect(
        await screen.findByRole("tab", { name: /Walk 11 min/ }),
      ).toBeInTheDocument();
      fireEvent.mouseDown(screen.getByRole("tab", { name: /walk/i }));
      fireEvent.click(screen.getByRole("tab", { name: /walk/i }));
      await waitFor(() => expect(query().get("mode")).toBe("walk"));
      fireEvent.click(
        screen.getByRole("button", { name: "Clear starting point" }),
      );
      act(() => map().onPickOrigin({ lat: 36.69, lng: 137.86 }));
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
      expect(screen.getByRole("tab", { name: "Drive" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Walk" })).toBeInTheDocument();
    } finally {
      happo.accessPoints.pop();
    }
  });

  it("a Food place shows no times on the tabs: its place is picked per mode", async () => {
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
      "?from=36.69736,137.85393&mode=drive&cat=food&dest=poi:osm:node/1",
    );
    await waitFor(() => expect(map().destination).toEqual(ramen));
    await waitFor(() => expect(map().routes).toEqual([drive]));
    expect(screen.getByRole("tab", { name: "Drive" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Walk" })).toBeInTheDocument();
  });

  it("switching to Bus drops the drive route target: the map gets no destination", async () => {
    renderShell("?from=36.69736,137.85393&mode=drive&resort=happo-one");
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
  // box, but the link had no resort and Drive and Walk had no destination
  it("a tapped bus's resort stays the destination in the link and on Drive", async () => {
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
    fireEvent.mouseDown(screen.getByRole("tab", { name: /drive/i }));
    fireEvent.click(screen.getByRole("tab", { name: /drive/i }));
    await waitFor(() => expect(query().get("mode")).toBe("drive"));
    await waitFor(() =>
      expect(map().destination).toEqual(happo.accessPoints[0].coord),
    );
    expect(
      await screen.findByRole("tab", { name: /Drive 8 min/ }),
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
});

describe("MapShell pilot", () => {
  it("Start hands the route to the pilot; Exit returns to the planner", async () => {
    const { container } = renderShell(
      "?from=36.69736,137.85393&mode=drive&resort=happo-one",
    );
    const main = () => container.querySelector("main") as HTMLElement;
    fireEvent.click(
      await screen.findByRole("button", { name: /start navigation/i }),
    );
    expect(main().dataset.piloting).toBe("true");
    expect(map().routes).toEqual([drive]);
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
    renderShell(`?from=${from}&mode=drive&resort=happo-one`);
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
  // (the Walk tab's time asks for its route too, so the drive call isn't always last)
  it("Move down swaps two stops in the route and the link", async () => {
    vi.mocked(api.fetchPath).mockResolvedValue(drive);
    const a = { lat: 36.69, lng: 137.84 };
    const b = { lat: 36.695, lng: 137.845 };
    renderShell(
      `?from=${from}&mode=drive&resort=happo-one&stops=36.69000,137.84000;36.69500,137.84500`,
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
        "drive",
        [fromCoord, b, a, gondola],
        {
          stopAtPoints: true,
        },
      ),
    );
  });

  it("Add destination opens a stop box that takes the next map tap; the route goes through it", async () => {
    vi.mocked(api.fetchPath).mockResolvedValue(drive);
    renderShell(`?from=${from}&mode=drive&resort=happo-one`);
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
        "drive",
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
    renderShell(`?from=${from}&mode=drive`);
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
    renderShell(`?from=${from}&mode=drive`);
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
    driveS: 463,
    driveDistanceM: 2500,
    accessPointId: "happo-one-adam-gondola",
    factors: {
      driveTime: 463,
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
    renderShell(`?from=${from}&mode=drive`);
    const card = within(
      await screen.findByRole("list", { name: "Ranked resorts" }),
    ).getByRole("button", { name: /Happo-One/ });
    card.focus();
    fireEvent.click(card); // Enter on a focused button
    await waitFor(async () => expect(await eta()).toHaveFocus());
    expect(await eta()).toHaveAttribute("aria-live", "polite");
  });

  it("a resort tapped on the map leaves focus where it was", async () => {
    renderShell(`?from=${from}&mode=drive`);
    await waitFor(() => expect(map().resorts).toHaveLength(1));
    act(() => map().onSelectResort("happo-one"));
    await eta();
    expect(document.body).toHaveFocus();
  });

  it("a mode tab keeps focus when its route appears below it", async () => {
    renderShell(`?from=${from}&mode=bus&resort=happo-one`);
    const driveTab = await screen.findByRole("tab", { name: /Drive 8 min/ });
    driveTab.focus();
    fireEvent.mouseDown(driveTab);
    fireEvent.click(driveTab);
    await eta();
    expect(driveTab).toHaveFocus();
  });

  it("Directions makes the start the destination and puts focus in the empty start box", async () => {
    renderShell(`?from=${from}&mode=drive`);
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
    renderShell(`?from=${from}&mode=drive`);
    fireEvent.click(await screen.findByRole("button", { name: "Directions" }));
    (document.activeElement as HTMLElement).blur();
    act(() => map().onPickOrigin({ lat: 36.69, lng: 137.86 }));
    fireEvent.click(
      await screen.findByRole("button", { name: /start navigation/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Exit navigation" }));
    expect(
      await screen.findByRole("combobox", { name: "Search hotel or place" }),
    ).not.toHaveFocus();
  });
});
