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
import { savedStore, setHotel, toggleInList } from "@/lib/saved-places";
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
  beforeEach(() => {
    localStorage.clear();
    savedStore.reset();
  });
  afterEach(() => vi.restoreAllMocks());

  function renderBox(label?: string) {
    const onSelect = vi.fn();
    const onClear = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SearchBox
          onSelect={onSelect}
          onClear={onClear}
          near={NEAR}
          label={label}
        />
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

  // Live iPhone QA (2026-11-02): the rows keep the input focused while pressed (so the
  // tap lands), which left the phone keyboard up over the results after a pick. On a
  // touch screen a pick lets go of the box, as in Google Maps; a desktop keeps focus.
  function pointer(coarse: boolean) {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (q: string) =>
        ({
          matches: coarse && q.includes("coarse"),
          media: q,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
  }

  it("touch: picking a suggestion closes the keyboard (the box lets go of focus)", async () => {
    if (!window.matchMedia) window.matchMedia = (() => ({})) as never;
    pointer(true);
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([hotelHakuba]);
    const { input, onSelect } = renderBox();
    input.focus();
    fireEvent.change(input, { target: { value: "Hotel" } });
    const [row] = await screen.findAllByRole("option");
    fireEvent.mouseDown(row);
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(hotelHakuba);
    expect(input).not.toHaveFocus();
  });

  it("desktop: picking a suggestion keeps focus in the box (keyboard users)", async () => {
    if (!window.matchMedia) window.matchMedia = (() => ({})) as never;
    pointer(false);
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([hotelHakuba]);
    const { input } = renderBox();
    input.focus();
    fireEvent.change(input, { target: { value: "Hotel" } });
    const [row] = await screen.findAllByRole("option");
    fireEvent.mouseDown(row);
    fireEvent.click(row);
    expect(input).toHaveFocus();
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

  it("on a phone, no matches suggests a long-press on the map", async () => {
    window.matchMedia = ((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([]);
    const { input } = renderBox();
    fireEvent.change(input, { target: { value: "Courtyard Hakuba" } });
    expect(
      await screen.findByText(
        /paste a google maps link or long-press the map/i,
      ),
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

  it("puts saved places first, marked with a star, without duplicating them", async () => {
    savedStore.update((st) =>
      toggleInList(st, { ...tokyuStop, kind: "stop" }, "starred"),
    );
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([
      hotelHakuba,
      tokyuStop,
    ]);
    const { input, onSelect } = renderBox();

    fireEvent.change(input, { target: { value: "Hakuba" } });
    await screen.findByRole("option", { name: /hotel hakuba/i });
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining("Hakuba Tokyu Hotel"),
      expect.stringContaining("Hotel Hakuba"),
    ]);
    expect(options[0]).toHaveTextContent("★");
    expect(options[0]).toHaveTextContent("Starred");

    fireEvent.click(options[0]);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: tokyuStop.id, kind: "stop" }),
    );
  });

  it("offers My hotel and saved places above recents on focus", async () => {
    savedStore.update((st) =>
      setHotel(st, { ...hotelHakuba, kind: "lodging" }),
    );
    rememberRecent(tokyuStop);
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([]);
    const { input } = renderBox();

    fireEvent.focus(input);
    const list = await screen.findByRole("listbox", {
      name: /saved and recent/i,
    });
    const options = within(list).getAllByRole("option");
    expect(options[0]).toHaveTextContent("Hotel Hakuba");
    expect(options[0]).toHaveTextContent("My hotel");
    expect(options[1]).toHaveTextContent("Hakuba Tokyu Hotel");
  });

  it("shows text the app sets, such as My hotel on start", () => {
    const { input } = renderBox("My hotel · Hotel Hakuba");
    expect(input).toHaveValue("My hotel · Hotel Hakuba");
  });
});

// BC-T1 (docs/ux/behaviour-cards.md): in Google's destination field typing is a draft; the
// trip changes only on a pick. Our To box adds: leaving without a pick puts the current
// name back, so the box never disagrees with the map (SPEC-web-app v1.8 rule 1).
describe("SearchBox draft rule (restoreOnBlur)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  function renderToBox(label: string | null, restoreOnBlur = true) {
    const onSelect = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SearchBox
          onSelect={onSelect}
          near={NEAR}
          label={label}
          ariaLabel="To"
          restoreOnBlur={restoreOnBlur}
        />
      </QueryClientProvider>,
    );
    return { onSelect, input: screen.getByRole("combobox", { name: "To" }) };
  }

  it("leaving the box without a pick puts the current name back and closes the list", async () => {
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([hotelHakuba]);
    const { input, onSelect } = renderToBox("Happo-One");
    input.focus();
    fireEvent.change(input, { target: { value: "Hotel" } });
    await screen.findAllByRole("option");
    fireEvent.blur(input);
    expect(input).toHaveValue("Happo-One");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Escape without a pick puts the current name back and closes the list", async () => {
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([hotelHakuba]);
    const { input } = renderToBox("Happo-One");
    input.focus();
    fireEvent.change(input, { target: { value: "Hotel" } });
    await screen.findAllByRole("option");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("Happo-One");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("a pick is not undone: the box shows the chosen place", async () => {
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([hotelHakuba]);
    const { input, onSelect } = renderToBox("Happo-One");
    input.focus();
    fireEvent.change(input, { target: { value: "Hotel" } });
    const [row] = await screen.findAllByRole("option");
    fireEvent.mouseDown(row);
    fireEvent.click(row);
    fireEvent.blur(input);
    expect(onSelect).toHaveBeenCalledWith(hotelHakuba);
    expect(input).toHaveValue("Hotel Hakuba");
  });

  it("an empty To box (no destination) is empty again after leaving it", () => {
    const { input } = renderToBox(null);
    input.focus();
    fireEvent.change(input, { target: { value: "Cort" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("");
  });

  it("without the rule (the From box) typed text stays on blur, as today", () => {
    const { input } = renderToBox("Hotel Hakuba", false);
    input.focus();
    fireEvent.change(input, { target: { value: "Tokyu" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("Tokyu");
  });
});

describe("SearchBox draft rule and ✕", () => {
  afterEach(() => vi.restoreAllMocks());

  it("after ✕ a blur keeps the box empty (the cleared name doesn't come back)", () => {
    const onClear = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SearchBox
          onSelect={vi.fn()}
          onClear={onClear}
          near={NEAR}
          label="Happo-One"
          ariaLabel="To"
          clearLabel="Remove destination"
          restoreOnBlur
        />
      </QueryClientProvider>,
    );
    const input = screen.getByRole("combobox", { name: "To" });
    input.focus();
    fireEvent.click(screen.getByRole("button", { name: "Remove destination" }));
    fireEvent.blur(input);
    expect(onClear).toHaveBeenCalled();
    expect(input).toHaveValue("");
  });
});

// Found by the resilience journey (suggest → wrongShape crashed on load): the To box
// showed the destination's name and searched for it with nobody typing. Only typed text
// is a query; text the app puts in the box (a label, a pick) is not.
describe("SearchBox searches only what was typed", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a label the app sets (the destination, My hotel) sends no search", async () => {
    const suggest = vi.spyOn(api, "fetchSuggestions").mockResolvedValue([]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SearchBox
          onSelect={vi.fn()}
          near={NEAR}
          label="Hakuba Happo-One"
          ariaLabel="To"
          restoreOnBlur
        />
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 300)); // past the 150 ms debounce
    expect(suggest).not.toHaveBeenCalled();
  });

  it("typing after the label does search", async () => {
    const suggest = vi.spyOn(api, "fetchSuggestions").mockResolvedValue([]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SearchBox
          onSelect={vi.fn()}
          near={NEAR}
          label="Hakuba Happo-One"
          ariaLabel="To"
          restoreOnBlur
        />
      </QueryClientProvider>,
    );
    const input = screen.getByRole("combobox", { name: "To" });
    input.focus();
    fireEvent.change(input, { target: { value: "Cortina" } });
    await waitFor(() => expect(suggest).toHaveBeenCalledWith("Cortina", NEAR));
  });
});

// Code review of v1.8: Enter must never pick something nobody chose (spec: nothing a
// search does edits the trip without an explicit choice), and Japanese input must work.
describe("SearchBox Enter picks only an explicit choice", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  function renderFilled() {
    const onSelect = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SearchBox
          onSelect={onSelect}
          near={NEAR}
          label="Hakuba Happo-One"
          ariaLabel="To"
          restoreOnBlur
        />
      </QueryClientProvider>,
    );
    return { onSelect, input: screen.getByRole("combobox", { name: "To" }) };
  }

  it("focus then Enter on a filled box picks nothing (not the top recent or My hotel)", () => {
    rememberRecent(hotelHakuba);
    const { input, onSelect } = renderFilled();
    input.focus();
    fireEvent.focus(input); // opens the list: the recents are showing
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("an arrow-key choice from the recents then Enter is a pick", () => {
    rememberRecent(hotelHakuba);
    const { input, onSelect } = renderFilled();
    input.focus();
    fireEvent.focus(input); // the recents open
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: hotelHakuba.id }),
    );
  });

  it("Escape then a quick Enter does not pick the abandoned draft's top result", async () => {
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([hotelHakuba]);
    const { input, onSelect } = renderFilled();
    input.focus();
    fireEvent.change(input, { target: { value: "Hotel" } });
    await screen.findAllByRole("option");
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Enter that confirms a Japanese conversion (IME composing) picks nothing", async () => {
    vi.spyOn(api, "fetchSuggestions").mockResolvedValue([hotelHakuba]);
    const { input, onSelect } = renderFilled();
    input.focus();
    fireEvent.change(input, { target: { value: "はくば" } });
    await screen.findAllByRole("option");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onSelect).not.toHaveBeenCalled();
    expect(input).toHaveValue("はくば");
  });
});
