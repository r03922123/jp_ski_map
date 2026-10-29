import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchBox } from "@/components/SearchBox";
import type { Place } from "@/lib/api";
import * as api from "@/lib/api";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const hotelHakuba: Place = {
  id: "osm:node/6312753047",
  name: "Hotel Hakuba",
  kind: "hotel",
  coord: { lat: 36.697108, lng: 137.8539256 },
  address: "白馬岳線, 白馬村",
  source: "photon",
};
const mominoki: Place = {
  ...hotelHakuba,
  id: "osm:node/7006958860",
  name: "Hakuba Mominoki Hotel",
};

describe("useDebouncedValue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("only publishes the value after it has been stable for the delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "H" } },
    );

    rerender({ value: "Ho" });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: "Hot" });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("H");

    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe("Hot");
  });
});

describe("SearchBox", () => {
  function renderBox() {
    const onSelect = vi.fn();
    const onClear = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SearchBox onSelect={onSelect} onClear={onClear} />
      </QueryClientProvider>,
    );
    return {
      onSelect,
      onClear,
      input: screen.getByRole("combobox", { name: /search/i }),
    };
  }

  it("clears the text and the starting point with the ✕ button", async () => {
    vi.spyOn(api, "fetchPlaces").mockResolvedValue([hotelHakuba]);
    const { input, onClear } = renderBox();
    expect(
      screen.queryByRole("button", { name: /clear starting point/i }),
    ).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Hotel Hakuba" } });
    fireEvent.click(
      screen.getByRole("button", { name: /clear starting point/i }),
    );

    expect(input).toHaveValue("");
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  afterEach(() => vi.restoreAllMocks());

  it("searches once for a burst of typing and lists results", async () => {
    const search = vi
      .spyOn(api, "fetchPlaces")
      .mockResolvedValue([hotelHakuba, mominoki]);
    const { input } = renderBox();

    for (const text of ["H", "Ho", "Hot", "Hotel", "Hotel Hakuba"]) {
      fireEvent.change(input, { target: { value: text } });
    }

    expect(
      await screen.findByRole("option", { name: /hotel hakuba/i }),
    ).toBeInTheDocument();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("Hotel Hakuba");
  });

  it("selects a result by click", async () => {
    vi.spyOn(api, "fetchPlaces").mockResolvedValue([hotelHakuba]);
    const { input, onSelect } = renderBox();

    fireEvent.change(input, { target: { value: "Hotel Hakuba" } });
    fireEvent.click(
      await screen.findByRole("option", { name: /hotel hakuba/i }),
    );

    expect(onSelect).toHaveBeenCalledWith(hotelHakuba);
  });

  it("selects with arrow keys and Enter", async () => {
    vi.spyOn(api, "fetchPlaces").mockResolvedValue([hotelHakuba, mominoki]);
    const { input, onSelect } = renderBox();

    fireEvent.change(input, { target: { value: "Hakuba" } });
    await screen.findAllByRole("option");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith(mominoki);
  });

  it("suggests a Google Maps link or tapping the map when nothing matches", async () => {
    vi.spyOn(api, "fetchPlaces").mockResolvedValue([]);
    const { input } = renderBox();

    fireEvent.change(input, { target: { value: "Courtyard Hakuba" } });

    expect(
      await screen.findByText(/paste a google maps link or tap the map/i),
    ).toBeInTheDocument();
  });

  it("shows an error but keeps working when search is down", async () => {
    vi.spyOn(api, "fetchPlaces").mockRejectedValue(
      new api.ApiError("upstream_unavailable", 502),
    );
    const { input } = renderBox();

    fireEvent.change(input, { target: { value: "Hotel" } });

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /search is unavailable/i,
      ),
    );
  });
});
