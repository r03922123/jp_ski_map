import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
