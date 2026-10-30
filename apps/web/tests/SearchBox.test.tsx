import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchBox } from "@/components/SearchBox";
import type { Suggestion } from "@/lib/api";
import * as api from "@/lib/api";
import { loadRecent, RECENT_KEY, rememberRecent } from "@/lib/recent-searches";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const hotelHakuba: Suggestion = {
  id: "osm:node/6312753047",
  kind: "lodging",
  name: "Hotel Hakuba",
  nameJa: "ホテル白馬",
  coord: { lat: 36.697108, lng: 137.8539256 },
  detail: "Hotel",
  match: [0, 5],
  source: "index",
};
const tokyuStop: Suggestion = {
  id: "stop-hakuba-tokyu-hotel",
  kind: "stop",
  name: "Hakuba Tokyu Hotel",
  nameJa: "白馬東急ホテル",
  coord: { lat: 36.7, lng: 137.84 },
  detail: "Bus stop",
  match: [7, 10],
  source: "index",
};
const NEAR = { lat: 36.7, lng: 137.86 };

describe("useDebouncedValue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("only publishes the value after it has been stable for the delay", () => {
    const { result, rerender } = renderHook(
      ({ v }) => useDebouncedValue(v, 150),
      { initialProps: { v: "a" } },
    );
    rerender({ v: "ab" });
    expect(result.current).toBe("a");
    act(() => vi.advanceTimersByTime(150));
    expect(result.current).toBe("ab");
  });
});

describe("recent searches", () => {
  beforeEach(() => localStorage.clear());

  it("remembers the last five picks, most recent first, without duplicates", () => {
    rememberRecent(hotelHakuba);
    rememberRecent(tokyuStop);
    rememberRecent(hotelHakuba);

    expect(loadRecent().map((s) => s.name)).toEqual([
      "Hotel Hakuba",
      "Hakuba Tokyu Hotel",
    ]);
    expect(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")).toHaveLength(
      2,
    );
  });

  it("survives unreadable storage", () => {
    localStorage.setItem(RECENT_KEY, "{not json");
    expect(loadRecent()).toEqual([]);
  });
});

describe("SearchBox", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  function renderBox() {
    const onSelect = vi.fn();
    const onClear = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SearchBox onSelect={onSelect} onClear={onClear} near={NEAR} />
      </QueryClientProvider>,
    );
    return {
      onSelect,
      onClear,
      input: screen.getByRole("combobox", { name: /search/i }),
    };
  }

  it("suggests once for a burst of typing, biased to the map centre", async () => {
    const suggest = vi
      .spyOn(api, "fetchSuggestions")
      .mockResolvedValue([hotelHakuba, tokyuStop]);
    const { input } = renderBox();

    for (const text of ["H", "Ho", "Hot", "Hotel", "Hotel Hakuba"]) {
      fireEvent.change(input, { target: { value: text } });
    }

    expect(
      await screen.findByRole("option", { name: /hotel hakuba/i }),
    ).toBeInTheDocument();
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith("Hotel Hakuba", NEAR);
  });

  it("shows an icon per kind, bolds the matched text and the detail line", async () => {
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([
      hotelHakuba,
      tokyuStop,
    ]);
    const { input } = renderBox();

    fireEvent.change(input, { target: { value: "Hotel" } });
    const options = await screen.findAllByRole("option");

    expect(options[0]).toHaveTextContent("🏨");
    expect(
      within(options[0]).getByText("Hotel", { selector: "b" }),
    ).toBeInTheDocument();
    expect(options[0]).toHaveTextContent("ホテル白馬");
    expect(options[1]).toHaveTextContent("🚏");
    expect(
      within(options[1]).getByText("Tok", { selector: "b" }),
    ).toBeInTheDocument();
    expect(options[1]).toHaveTextContent("Bus stop");
  });

  it("Enter picks the top suggestion and remembers it", async () => {
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([
      hotelHakuba,
      tokyuStop,
    ]);
    const { input, onSelect } = renderBox();

    fireEvent.change(input, { target: { value: "Hotel" } });
    await screen.findAllByRole("option");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith(hotelHakuba);
    expect(loadRecent()[0].id).toBe(hotelHakuba.id);
  });

  it("selects with arrow keys and Enter", async () => {
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([
      hotelHakuba,
      tokyuStop,
    ]);
    const { input, onSelect } = renderBox();

    fireEvent.change(input, { target: { value: "Hakuba" } });
    await screen.findAllByRole("option");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith(tokyuStop);
  });

  it("offers recent picks when the empty box is focused", async () => {
    rememberRecent(tokyuStop);
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([]);
    const { input, onSelect } = renderBox();

    fireEvent.focus(input);
    const recent = await screen.findByRole("listbox", { name: /recent/i });
    fireEvent.click(within(recent).getByRole("option", { name: /tokyu/i }));

    expect(onSelect).toHaveBeenCalledWith(tokyuStop);
  });

  it("suggests a Google Maps link or tapping the map when nothing matches", async () => {
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([]);
    const { input } = renderBox();

    fireEvent.change(input, { target: { value: "Courtyard Hakuba" } });

    expect(
      await screen.findByText(/paste a google maps link or tap the map/i),
    ).toBeInTheDocument();
  });

  it("shows an error but keeps working when search is down", async () => {
    vi.spyOn(api, "fetchSuggestions").mockRejectedValue(
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

  it("clears the text and the starting point with the ✕ button", async () => {
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([hotelHakuba]);
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
});
