import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Place, Resort, Route } from "@/lib/api";
import type { SavedMarker } from "@/lib/saved-places";

// Characterization of what MapView hands MapLibre: every source with its data, every layer
// with its style, every marker with its spot and content. MapView.test.tsx stubs these
// out; this file pins them so moving them into their own components changes nothing.
const h = vi.hoisted(() => ({
  props: {} as Record<string, unknown>,
  container: null as HTMLElement | null,
}));

vi.mock("maplibre-gl", () => ({ setWorkerUrl: () => {} }));
vi.mock("react-map-gl/maplibre", async () => {
  const React = await import("react");
  const json = (v: unknown) => JSON.stringify(v);
  const map = {
    easeTo: () => {},
    fitBounds: () => {},
    flyTo: () => {},
    getZoom: () => 14,
    project: () => ({ x: 200, y: 400 }),
    getCanvas: () => ({ clientHeight: 800, clientWidth: 400 }),
    getContainer: () => h.container,
    getBounds: () => ({
      getSouth: () => 36.6,
      getWest: () => 137.8,
      getNorth: () => 36.8,
      getEast: () => 137.9,
    }),
  };
  const MapGL = React.forwardRef(function MapGL(
    p: Record<string, unknown> & { children?: ReactNode },
    ref,
  ) {
    h.props = p;
    React.useImperativeHandle(ref, () => map);
    return (
      <div
        data-map
        data-interactive={json(p.interactiveLayerIds)}
        data-attribution={json(p.attributionControl)}
      >
        {p.children}
      </div>
    );
  });
  const Source = (p: { id: string; data: unknown; children?: ReactNode }) => (
    <div data-source={p.id} data-data={json(p.data)}>
      {p.children}
    </div>
  );
  const Layer = ({ id, ...rest }: { id: string }) => (
    <i data-layer={id} data-style={json(rest)} />
  );
  const Marker = (p: {
    longitude: number;
    latitude: number;
    anchor?: string;
    style?: object;
    children?: ReactNode;
  }) => (
    <div
      data-marker-at={`${p.longitude},${p.latitude}`}
      data-anchor={p.anchor}
      data-style={json(p.style)}
    >
      {p.children}
    </div>
  );
  const Popup = (p: { anchor?: string; children?: ReactNode }) => (
    <div data-popup data-anchor={p.anchor}>
      {p.children}
    </div>
  );
  return {
    __esModule: true,
    default: MapGL,
    Layer,
    Marker,
    NavigationControl: () => <div data-nav-control />,
    Popup,
    Source,
  };
});

const { default: MapView } = await import("@/components/MapView");

const line = (coords: [number, number][]) => ({
  type: "LineString" as const,
  coordinates: coords,
});
const route = (
  mode: Route["mode"],
  durationS: number,
  coords: [number, number][],
) =>
  ({
    mode,
    durationS,
    distanceM: 1000,
    geometry: line(coords),
  }) as unknown as Route;
const ROUTES = [
  route("walk", 660, [
    [137.854, 36.697],
    [137.858, 36.698],
    [137.862, 36.699],
  ]),
  route("walk", 840, [
    [137.854, 36.697],
    [137.857, 36.701],
    [137.862, 36.699],
  ]),
];
const RESORTS = [
  {
    id: "happo-one",
    name: { en: "Hakuba Happo-One Snow Resort", ja: "白馬八方尾根" },
    accessPoints: [{ coord: { lat: 36.69, lng: 137.83 } }],
  },
  {
    id: "goryu",
    name: { en: "Hakuba Goryu Ski Resort", ja: "白馬五竜" },
    accessPoints: [{ coord: { lat: 36.66, lng: 137.82 } }],
  },
  {
    id: "iwatake",
    name: { en: "Hakuba Iwatake Mountain Resort", ja: "岩岳" },
    accessPoints: [{ coord: { lat: 36.71, lng: 137.84 } }],
  },
] as unknown as Resort[];
const LODGING = [
  { name: "Hotel Hakuba", coord: { lat: 36.697, lng: 137.854 } },
  { name: "Starfall Lodge", coord: { lat: 36.7, lng: 137.856 } },
] as Place[];
const SAVED: SavedMarker[] = [
  {
    id: "s1",
    name: "My hotel",
    coord: { lat: 36.697, lng: 137.854 },
    icon: "hotel",
  },
  {
    id: "s2",
    name: "Station",
    coord: { lat: 36.699, lng: 137.862 },
    icon: "heart",
  },
];
const RIDE = {
  route: route("drive", 1680, [
    [137.86, 36.7],
    [137.85, 36.68],
    [137.84, 36.66],
  ]),
  stops: [
    { coord: { lat: 36.7, lng: 137.86 }, name: "Happo Bus Terminal" },
    { coord: { lat: 36.68, lng: 137.85 }, name: "Echoland" },
    { coord: { lat: 36.66, lng: 137.84 }, name: "Hakuba 47" },
  ],
  label: "Line V · 28 min",
};

type Props = Parameters<typeof MapView>[0];
const base: Props = {
  resorts: RESORTS,
  shownResortIds: ["happo-one", "goryu"],
  selectedResortId: "goryu",
  origin: { lat: 36.697, lng: 137.854 },
  destination: { lat: 36.699, lng: 137.862 },
  routes: ROUTES,
  activeRoute: 0,
  highlight: [0, 1],
  lodging: LODGING,
  busStop: { lat: 36.7, lng: 137.86 },
  ride: RIDE,
  flyTo: null,
  onPickOrigin: () => {},
  onSelectResort: () => {},
  saved: SAVED,
  stops: [{ coord: { lat: 36.698, lng: 137.858 }, name: "Konbini" }],
  droppedPin: { coord: { lat: 36.7, lng: 137.85 }, name: "Pin" },
  pinCard: <p>pin card</p>,
};
const PILOT: Props["pilot"] = {
  camera: { center: [137.858, 36.698], bearing: 30, pitch: 45, zoom: 16 },
  puck: [137.858, 36.698],
  heading: 90,
  covered: [
    [137.854, 36.697],
    [137.858, 36.698],
  ],
  following: true,
  onUserMove: () => {},
  pose: "walk",
};

const load = () =>
  act(() => (h.props.onLoad as (e: unknown) => void)({ target: mapOf() }));
const mapOf = () => ({
  getCanvas: () => ({ clientHeight: 800, clientWidth: 400 }),
  getBounds: () => ({
    getSouth: () => 36.6,
    getWest: () => 137.8,
    getNorth: () => 36.8,
    getEast: () => 137.9,
  }),
  getZoom: () => 14,
});

describe("MapView draws (characterization)", () => {
  it("planning on foot: routes, alternates, ride, lodging, markers and labels", () => {
    const { container } = render(<MapView {...base} />);
    expect(container).toMatchSnapshot();
  });

  it("planning by car: the active route is the gold-dashed track", () => {
    const drive = ROUTES.map((r) => ({ ...r, mode: "drive" as const }));
    const { container } = render(
      <MapView {...base} routes={drive} activeRoute={1} ride={null} />,
    );
    expect(container).toMatchSnapshot();
  });

  it("navigating: the covered part, the rider puck, the start dot, no time chips", () => {
    const { container } = render(<MapView {...base} pilot={PILOT} />);
    expect(container).toMatchSnapshot();
  });

  it("empty: every route source stays mounted, empty", () => {
    const { container } = render(
      <MapView
        {...base}
        routes={[]}
        ride={null}
        highlight={null}
        lodging={[]}
        saved={[]}
        stops={[]}
        droppedPin={null}
        busStop={null}
        origin={null}
        destination={null}
      />,
    );
    expect(container).toMatchSnapshot();
  });
});

describe("MapView taps", () => {
  it("lodging pins, alternate routes and the runs' and lifts' hit line take a tap (SPEC-ski-runs v2)", () => {
    const { container } = render(<MapView {...base} />);
    expect(
      JSON.parse(
        container
          .querySelector("[data-map]")
          ?.getAttribute("data-interactive") ?? "null",
      ),
    ).toEqual(["lodging-pins", "route-alts-hit", "ski-hit"]);
    expect(container.querySelector('[data-layer="ski-hit"]')).not.toBeNull();
  });
});

describe("MapView phone credits", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const credits = () => {
    const el = document.createElement("div");
    el.className = "maplibregl-compact-show";
    h.container = document.createElement("div");
    h.container.append(el);
    return el;
  };

  it("fold five seconds after the map loads, and again for a new trip", () => {
    const el = credits();
    const { rerender } = render(<MapView {...base} />);
    load();
    act(() => vi.advanceTimersByTime(4999));
    expect(el.classList.contains("maplibregl-compact-show")).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(el.classList.contains("maplibregl-compact-show")).toBe(false);

    el.classList.add("maplibregl-compact-show"); // the ⓘ reopened them
    rerender(<MapView {...base} />);
    expect(el.classList.contains("maplibregl-compact-show")).toBe(true);
    rerender(<MapView {...base} activeRoute={1} />);
    expect(el.classList.contains("maplibregl-compact-show")).toBe(false);
  });
});

describe("MapView clicks on a route line and double-clicks", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const click = (feature: object | undefined, detail = 1) =>
    act(() =>
      (h.props.onClick as (e: unknown) => void)({
        features: feature ? [feature] : [],
        lngLat: { lat: 36.7, lng: 137.85 },
        originalEvent: { detail },
      }),
    );
  const altLine = { layer: { id: "route-alts-hit" }, properties: { index: 1 } };

  it("a click on an alternate selects it, unless a stop box is open", () => {
    const onSelectRoute = vi.fn();
    const onPickOrigin = vi.fn();
    const { rerender } = render(
      <MapView
        {...base}
        onSelectRoute={onSelectRoute}
        onPickOrigin={onPickOrigin}
      />,
    );
    click(altLine);
    expect(onSelectRoute).toHaveBeenCalledWith(1);
    rerender(
      <MapView
        {...base}
        placingStop
        onSelectRoute={onSelectRoute}
        onPickOrigin={onPickOrigin}
      />,
    );
    click(altLine);
    act(() => vi.advanceTimersByTime(300));
    expect(onSelectRoute).toHaveBeenCalledTimes(1);
    expect(onPickOrigin).toHaveBeenCalledTimes(1); // the stop box takes the point
  });

  it("the second click of a double-click picks nothing", () => {
    const onPickOrigin = vi.fn();
    render(<MapView {...base} onPickOrigin={onPickOrigin} />);
    click(undefined, 2);
    act(() => vi.advanceTimersByTime(300));
    expect(onPickOrigin).not.toHaveBeenCalled();
    click(undefined, 1);
    act(() => vi.advanceTimersByTime(300));
    expect(onPickOrigin).toHaveBeenCalledWith({ lat: 36.7, lng: 137.85 });
  });
});
