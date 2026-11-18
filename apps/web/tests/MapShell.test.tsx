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
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapShell } from "@/components/MapShell";
import type MapView from "@/components/MapView";
import type { Resort, Route } from "@/lib/api";
import * as api from "@/lib/api";
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
    fetchBusOptions: vi.fn(async () => ({ options: [], basis: "published" })),
    fetchLodging: vi.fn(async () => []),
    fetchNearbyPois: vi.fn(async () => []),
  };
});

/** The page's query string, as the URL mirror wrote it. */
const query = () => new URLSearchParams(window.location.search);

// `?skip-title`: no title screen over the app (a shared link skips it too)
function renderShell(search = "?skip-title") {
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
    expect(api.fetchRoutes).toHaveBeenLastCalledWith(
      "drive",
      { lat: 36.69736, lng: 137.85393 },
      happo.accessPoints[0].coord,
    );
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

  it("switching to Bus drops the drive route target: the map gets no destination", async () => {
    renderShell("?from=36.69736,137.85393&mode=drive&resort=happo-one");
    await waitFor(() => expect(map().destination).not.toBeNull());
    fireEvent.mouseDown(screen.getByRole("tab", { name: /bus/i }));
    fireEvent.click(screen.getByRole("tab", { name: /bus/i }));
    await waitFor(() => expect(query().get("mode")).toBe("bus"));
    expect(map().destination).toBeNull();
    await waitFor(() => expect(api.fetchBusOptions).toHaveBeenCalled());
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
