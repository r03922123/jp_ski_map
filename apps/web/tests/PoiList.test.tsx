import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PoiList } from "@/components/PoiList";
import type { NearbyPoi } from "@/lib/api";

const seven: NearbyPoi = {
  id: "osm:node/1",
  category: "convenience",
  name: "7-Eleven Hakuba Happo",
  nameJa: "セブン-イレブン 白馬八方店",
  coord: { lat: 36.69, lng: 137.84 },
  brand: "7-Eleven",
  cuisine: null,
  openingHours: "24/7",
  durationS: 240,
  distanceM: 1650,
};
const lawson: NearbyPoi = {
  ...seven,
  id: "osm:node/2",
  name: "Lawson",
  nameJa: null,
  brand: "LAWSON",
  openingHours: null,
  durationS: 600,
  distanceM: 3000,
};

describe("PoiList", () => {
  it("lists places with ETA, distance, brand, Japanese name and hours", () => {
    render(
      <PoiList
        state={{ status: "success", data: [seven, lawson] }}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("7-Eleven Hakuba Happo");
    expect(items[0]).toHaveTextContent("セブン-イレブン 白馬八方店");
    expect(items[0]).toHaveTextContent("~ 4 min");
    expect(items[0]).toHaveTextContent("1.7 km");
    expect(items[0]).toHaveTextContent("Hours: 24/7");
    expect(items[1]).not.toHaveTextContent("Hours:");
  });

  it("selects a place and marks it pressed", () => {
    const onSelect = vi.fn();
    render(
      <PoiList
        state={{ status: "success", data: [seven, lawson] }}
        selectedId="osm:node/2"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /7-Eleven/ }));

    expect(onSelect).toHaveBeenCalledWith(seven);
    expect(screen.getByRole("button", { name: /Lawson/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("explains an empty or failed list", () => {
    const { rerender } = render(
      <PoiList
        state={{ status: "success", data: [] }}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(/nothing of this kind/i)).toBeInTheDocument();

    rerender(
      <PoiList
        state={{ status: "error" }}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("PoiList Google rating card (SPEC-poi-destinations v1.2)", () => {
  const soba: NearbyPoi = {
    ...seven,
    id: "osm:node/3",
    category: "food",
    name: "Soba Fuku",
    googlePlaceId: "ChIJtest-soba",
  };
  const googleScripts = () =>
    document.head.querySelectorAll(
      'script[src^="https://maps.googleapis.com/"]',
    );
  const request = (container: HTMLElement) =>
    container.querySelector("gmp-place-details-place-request");

  const failScripts = () => {
    for (const s of googleScripts()) {
      s.dispatchEvent(new Event("error"));
      s.remove();
    }
  };

  // a failed load lets the next card try again, so failing leftovers keeps each test fresh
  afterEach(async () => {
    vi.unstubAllEnvs();
    await act(async () => failScripts());
    delete window.google;
  });

  it("loads Google only once a row with a place ID is selected, and shows its card in that row", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_KEY", "test-key");
    const list = (selectedId: string | null) => (
      <PoiList
        state={{ status: "success", data: [soba, lawson] }}
        selectedId={selectedId}
        onSelect={vi.fn()}
      />
    );
    const { container, rerender } = render(list(null));
    expect(googleScripts()).toHaveLength(0);
    expect(request(container)).toBeNull();

    rerender(list(soba.id));

    expect(request(container)).toHaveAttribute("place", "ChIJtest-soba");
    const card = container.querySelector("gmp-place-details-compact");
    expect(card?.parentElement?.closest("li")).toBe(
      screen.getByRole("button", { name: /Soba Fuku/ }).closest("li"),
    );
    expect(card?.closest("button")).toBeNull();
    expect(googleScripts()).toHaveLength(1);
    expect(googleScripts()[0].getAttribute("src")).toContain("key=test-key");
  });

  it("shows no card and loads nothing without a key or a place ID", () => {
    const { container, rerender } = render(
      <PoiList
        state={{ status: "success", data: [soba] }}
        selectedId={soba.id}
        onSelect={vi.fn()}
      />,
    );
    expect(request(container)).toBeNull();

    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_KEY", "test-key");
    rerender(
      <PoiList
        state={{ status: "success", data: [{ ...soba, googlePlaceId: null }] }}
        selectedId={soba.id}
        onSelect={vi.fn()}
      />,
    );
    expect(request(container)).toBeNull();
    expect(googleScripts()).toHaveLength(0);
  });

  it("drops the card when the element reports an error", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_KEY", "test-key");
    const { container } = render(
      <PoiList
        state={{ status: "success", data: [soba] }}
        selectedId={soba.id}
        onSelect={vi.fn()}
      />,
    );
    const card = container.querySelector("gmp-place-details-compact");

    act(() => {
      card?.dispatchEvent(new Event("gmp-error"));
    });

    expect(container.querySelector("gmp-place-details-compact")).toBeNull();
  });

  it("drops the card when the script fails, and tries again on the next selection", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_KEY", "test-key");
    const list = (selectedId: string | null) => (
      <PoiList
        state={{ status: "success", data: [soba] }}
        selectedId={selectedId}
        onSelect={vi.fn()}
      />
    );
    const { container, rerender } = render(list(soba.id));
    expect(googleScripts()).toHaveLength(1);

    await act(async () => failScripts());

    expect(container.querySelector("gmp-place-details-compact")).toBeNull();
    rerender(list(null));
    rerender(list(soba.id));
    expect(request(container)).toHaveAttribute("place", "ChIJtest-soba");
    expect(googleScripts()).toHaveLength(1);
  });

  // Measured on production 2026-11-25: with loading=async, google.maps exists at the script's
  // load event but importLibrary arrives later, so only Google's callback means "ready".
  it("keeps the card while Google starts up and loads Places once Google says it is ready", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_KEY", "test-key");
    const { container } = render(
      <PoiList
        state={{ status: "success", data: [soba] }}
        selectedId={soba.id}
        onSelect={vi.fn()}
      />,
    );
    const script = googleScripts()[0];
    const importLibrary = vi.fn(async () => ({}));

    window.google = { maps: {} } as unknown as typeof window.google;
    await act(async () => script.dispatchEvent(new Event("load")));
    expect(request(container)).toHaveAttribute("place", "ChIJtest-soba");

    window.google = { maps: { importLibrary } };
    const callback = new URL(script.getAttribute("src") ?? "").searchParams.get(
      "callback",
    );
    expect(callback).toBeTruthy();
    await act(async () =>
      (window as unknown as Record<string, () => void>)[callback ?? ""](),
    );
    expect(importLibrary).toHaveBeenCalledWith("places");
    expect(request(container)).toHaveAttribute("place", "ChIJtest-soba");
  });
});
