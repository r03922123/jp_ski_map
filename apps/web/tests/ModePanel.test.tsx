import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModePanel, type ModePanelProps } from "@/components/ModePanel";
import type { Resort, Route } from "@/lib/api";

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

function route(overrides: Partial<Route> = {}): Route {
  return {
    mode: "drive",
    durationS: 172,
    distanceM: 837,
    geometry: { type: "LineString", coordinates: [] },
    steps: [
      {
        instruction: "Drive south.",
        distanceM: 20,
        durationS: 9,
        maneuver: "depart",
        streetNames: [],
        shapeRange: [0, 0],
      },
    ],
    isEstimate: true,
    ...overrides,
  };
}

function renderPanel(overrides: Partial<ModePanelProps> = {}) {
  const props: ModePanelProps = {
    mode: "drive",
    onModeChange: vi.fn(),
    resorts: [happo],
    selectedResortId: "happo-one",
    onSelectResort: vi.fn(),
    hasOrigin: true,
    route: { status: "success", data: route() },
    ...overrides,
  };
  render(<ModePanel {...props} />);
  return props;
}

function stubCoarse(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: matches && query === "(pointer: coarse)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

describe("ModePanel", () => {
  it("asks for a starting point before anything else", () => {
    renderPanel({ hasOrigin: false, route: { status: "idle" } });

    expect(
      screen.getByText(
        /type a place above, or tap the map, to set your starting point/i,
      ),
    ).toBeInTheDocument();
  });

  // cluster A / BC-A1: on touch a tap no longer sets the start; a long-press does
  it("on a phone, the hint says long-press the map", () => {
    stubCoarse(true);
    renderPanel({ hasOrigin: false, route: { status: "idle" } });
    expect(
      screen.getByText(/type a place above, or long-press the map/i),
    ).toBeInTheDocument();
    stubCoarse(false);
  });

  it("shows the ETA labelled as an estimate with distance", () => {
    renderPanel();

    expect(screen.getByText("ETA ~ 3 min · 837 m")).toBeInTheDocument();
  });

  it("lists the turn-by-turn steps", () => {
    renderPanel();

    expect(screen.getByText("Drive south.")).toBeInTheDocument();
  });

  it("switches mode when the Walk tab is chosen", () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole("tab", { name: /walk/i }));

    expect(props.onModeChange).toHaveBeenCalledWith("walk");
  });

  it("keeps the bus tab disabled until bus data exists", () => {
    renderPanel();

    expect(screen.getByRole("tab", { name: /bus/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("selects a resort from the picker", () => {
    const props = renderPanel({
      selectedResortId: null,
      route: { status: "idle" },
    });

    fireEvent.change(screen.getByLabelText(/resort/i), {
      target: { value: "happo-one" },
    });

    expect(props.onSelectResort).toHaveBeenCalledWith("happo-one");
  });

  it("explains when no route exists", () => {
    renderPanel({ route: { status: "error", error: "no_route" } });

    expect(screen.getByRole("alert")).toHaveTextContent(/no route found/i);
  });

  it("warns about walks longer than 45 minutes", () => {
    renderPanel({
      mode: "walk",
      route: {
        status: "success",
        data: route({ mode: "walk", durationS: 50 * 60 }),
      },
    });

    expect(screen.getByText(/long walk/i)).toBeInTheDocument();
  });
});
