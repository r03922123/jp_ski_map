import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render as rtlRender,
  screen,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResortList } from "@/components/ResortList";
import { SortControls } from "@/components/SortControls";
import type { RankedResort } from "@/lib/api";
import { DEFAULT_RANK } from "@/lib/url-state";

// resort cards carry a Check in button, which reads the resort catalog
// a wrapper (not a wrapped element), so rerender keeps the provider
const render = (ui: ReactElement) => {
  const client = new QueryClient();
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
};

function ranked(overrides: Partial<RankedResort> = {}): RankedResort {
  return {
    resortId: "happo-one",
    name: "Hakuba Happo-One Snow Resort",
    rank: 1,
    sortValue: 368,
    walkS: 368,
    walkDistanceM: 2500,
    accessPointId: "happo-one-adam-gondola",
    factors: {
      walkTime: 368,
      freshSnow: 46.8,
      snowDepth: 299,
      crowd: 0.6,
      runs: 16,
      area: 220,
      runLength: 23300,
      vertical: 1071,
      price: null,
    },
    snow: {
      resortId: "happo-one",
      asOf: "2026-01-12T07:00:00+09:00",
      depthCm: { base: 41, summit: 299, source: "model" },
      newSnowCm: { past24h: 45.6, past72h: 72.2, next24h: 2.5, next72h: 9.1 },
      tempC: { summitMin: -13.5, summitMax: -6.2 },
    },
    crowd: {
      resortId: "happo-one",
      date: "2026-01-12",
      level: "high",
      score: 0.6,
      source: "heuristic",
      isEstimate: true,
      reasons: ["3-day weekend (Coming of Age Day)", "Large, popular resort"],
      contributions: [
        { label: "3-day weekend (Coming of Age Day)", weight: 0.35 },
        { label: "Large, popular resort", weight: 0.25 },
      ],
    },
    statsSource:
      "https://www.hakubavalley.com/en/ski_resort_info_en/ (checked 2026-10-29); dayTicketJpy: https://www.happo-one.jp/price/ (checked 2026-11-06)",
    website: "https://www.happo-one.jp/",
    ...overrides,
  };
}

describe("ResortList", () => {
  it("shows rank, name, walk ETA, snow and an estimated crowd badge", () => {
    render(
      <ResortList resorts={[ranked()]} selectedId={null} onSelect={vi.fn()} />,
    );

    const item = screen.getByRole("button", { name: /Happo-One/ });
    expect(within(item).getByText("1")).toBeInTheDocument();
    expect(within(item).getByText(/Happo-One/)).toBeInTheDocument();
    expect(within(item).getByText("~ 6 min")).toBeInTheDocument();
    expect(
      within(item).getByText(/46 cm new · 299 cm summit/),
    ).toBeInTheDocument();
    expect(within(item).getByText("Crowd: high (est.)")).toBeInTheDocument();
  });

  it("shows the past 24 h of new snow and the summit depth on the card", () => {
    const snow = {
      ...ranked().snow,
      depthCm: { base: 20, summit: 76, source: "model" },
      newSnowCm: { past24h: 0, past72h: 55.9, next24h: 14.4, next72h: 20 },
    } as RankedResort["snow"];
    render(
      <ResortList
        resorts={[ranked({ snow })]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

    expect(
      within(screen.getByRole("button", { name: /Happo-One/ })).getByText(
        "❄ 0 cm new · 76 cm summit",
      ),
    ).toBeInTheDocument();
  });

  it("selects a resort", () => {
    const onSelect = vi.fn();
    render(
      <ResortList resorts={[ranked()]} selectedId={null} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Happo-One/ }));

    expect(onSelect).toHaveBeenCalledWith(
      "happo-one",
      "happo-one-adam-gondola",
    );
  });

  // T3 (docs/ux/google-maps-workflows.md): re-sorting or a new date must not hide the
  // selection. Reviews of #116: a new start reorders the list too and must not scroll it, and
  // a re-sort that keeps the order must not leave a scroll waiting for the next reorder
  describe("brings the selected resort into view after the user re-sorts", () => {
    const original = Element.prototype.scrollIntoView;
    const scroll = vi.fn();
    beforeEach(() => {
      scroll.mockClear();
      Element.prototype.scrollIntoView = scroll;
    });
    afterEach(() => {
      Element.prototype.scrollIntoView = original;
    });
    const a = ranked();
    const b = ranked({ resortId: "goryu", name: "Goryu", rank: 2 });
    const list = (order: RankedResort[], key: string, fetching: boolean) => (
      <ResortList
        resorts={order}
        selectedId="goryu"
        onSelect={vi.fn()}
        scrollKey={key}
        fetching={fetching}
      />
    );

    it("once the ranking for the new options has loaded", () => {
      const view = render(list([a, b], "walk", false));
      view.rerender(list([a, b], "snow", true));
      expect(scroll).not.toHaveBeenCalled();
      view.rerender(list([b, a], "snow", false));
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
      expect(scroll.mock.contexts[0]).toBe(
        screen.getByRole("button", { name: /Goryu/ }),
      );
    });

    it("not for a new start, nor later after a re-sort that kept the order", () => {
      const view = render(list([a, b], "walk", false));
      view.rerender(list([b, a], "walk", false)); // a new start
      expect(scroll).not.toHaveBeenCalled();
      view.rerender(list([b, a], "date", true)); // a new date, same order
      view.rerender(list([b, a], "date", false));
      scroll.mockClear();
      view.rerender(list([a, b], "date", true)); // then a new start
      view.rerender(list([a, b], "date", false));
      expect(scroll).not.toHaveBeenCalled();
    });
  });

  // the panel tidy left two sorts (2026-11-25); Details keeps their factors and crowd, which
  // refactor/remove-crowd removes, and drops the rows of the sorts it took away
  it("rounds the run length to one decimal, half up", () => {
    const factors = { ...ranked().factors, runLength: 20450 };
    render(
      <ResortList
        resorts={[ranked({ factors })]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("20.5 km")).toBeInTheDocument();
  });

  it("expands to the three resort sizes, with the snow time in its source", () => {
    render(
      <ResortList resorts={[ranked()]} selectedId={null} onSelect={vi.fn()} />,
    );

    fireEvent.click(screen.getByText(/details/i));

    const details = screen.getByText(/details/i).closest("details");
    if (!details) throw new Error("no Details");
    const factors = details.querySelector("dl");
    if (!factors) throw new Error("no factor list");
    expect(
      within(factors)
        .getAllByRole("term")
        .map((dt) => dt.textContent),
    ).toEqual(["Total runs", "Skiable area", "Run length"]);
    expect(
      within(factors)
        .getAllByRole("definition")
        .map((dd) => dd.textContent),
    ).toEqual(["16", "220 ha", "23.3 km"]);
    // the card already shows these: walk time in its header, crowd in Sources & weights
    for (const gone of [
      "Crowd score (est.)",
      /Crowd estimate:/,
      /Fresh snow \(24 h/,
      "Vertical drop",
      "Ticket price",
    ]) {
      expect(within(details).queryByText(gone)).not.toBeInTheDocument();
    }
    expect(
      within(details).getByText(/Open-Meteo model, as of 01\/12 07:00/),
    ).toBeInTheDocument();
  });

  it("keeps sources and weights closed until asked", () => {
    render(
      <ResortList resorts={[ranked()]} selectedId={null} onSelect={vi.fn()} />,
    );

    const sources = screen.getByText("Sources & weights").closest("details");
    expect(sources).not.toHaveAttribute("open");
  });

  it("links every stats URL and the data sources, and shows each crowd weight", () => {
    render(
      <ResortList resorts={[ranked()]} selectedId={null} onSelect={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("Sources & weights"));
    const block = within(
      screen.getByText("Sources & weights").closest("details") as HTMLElement,
    );
    const hrefs = block.getAllByRole("link").map((a) => a.getAttribute("href"));

    expect(hrefs).toEqual([
      "https://www.openstreetmap.org/copyright",
      "https://open-meteo.com/",
      "https://www.hakubavalley.com/en/ski_resort_info_en/",
      "https://www.happo-one.jp/price/",
      "https://www.happo-one.jp/",
    ]);
    for (const a of block.getAllByRole("link")) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(block.getByText("+0.35")).toBeInTheDocument();
    expect(block.getByText("+0.25")).toBeInTheDocument();
    expect(block.getByText("0.60")).toBeInTheDocument();
  });

  it("shows a negative weight and says when the sum was capped", () => {
    render(
      <ResortList
        resorts={[
          ranked({
            crowd: {
              ...(ranked().crowd as NonNullable<RankedResort["crowd"]>),
              score: 0,
              reasons: ["Early/late season"],
              contributions: [{ label: "Early/late season", weight: -0.15 }],
            },
          }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    const block = within(
      screen.getByText("Sources & weights").closest("details") as HTMLElement,
    );

    expect(block.getByText("−0.15")).toBeInTheDocument();
    expect(block.getByText(/capped to 0–1/)).toBeInTheDocument();
  });

  it("never turns a non-web URL in the stats source into a link", () => {
    render(
      <ResortList
        resorts={[
          ranked({ statsSource: "javascript:alert(1) and nothing else" }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    const block = within(
      screen.getByText("Sources & weights").closest("details") as HTMLElement,
    );

    expect(block.getByText(/javascript:alert\(1\)/)).toBeInTheDocument();
    expect(
      block
        .getAllByRole("link", { hidden: true })
        .every((a) => a.getAttribute("href")?.startsWith("https://")),
    ).toBe(true);
  });

  it("only links an http(s) website and drops trailing punctuation", () => {
    render(
      <ResortList
        resorts={[
          ranked({
            website: "data:text/html,<b>x</b>",
            statsSource: "Price: https://x.jp/price. Checked.",
          }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    const block = within(
      screen.getByText("Sources & weights").closest("details") as HTMLElement,
    );
    const hrefs = block
      .getAllByRole("link", { hidden: true })
      .map((a) => a.getAttribute("href"));

    expect(hrefs).not.toContain("data:text/html,<b>x</b>");
    expect(hrefs).toContain("https://x.jp/price");
    expect(block.getAllByText("(opens in a new tab)").length).toBe(
      hrefs.length,
    );
  });

  it("says on the card when the snow is from, once the report is over 90 minutes old", () => {
    // The fixture's report is from 07:00. The API serves its last good report while
    // Open-Meteo is down, and a list left open ages too.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-12T08:29:00+09:00"));
      render(
        <ResortList
          resorts={[ranked()]}
          selectedId={null}
          onSelect={vi.fn()}
        />,
      );
      const card = screen.getByRole("button", { name: /Happo-One/ });
      expect(within(card).queryByText(/as of/)).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(2 * 60_000); // 08:31, with the list still open
      });

      // its own line, so it never wraps in the middle on a narrow card
      expect(
        within(card).getByText("Snow as of 01/12 07:00"),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks unreachable resorts instead of showing an ETA", () => {
    render(
      <ResortList
        resorts={[ranked({ walkS: null, sortValue: null })]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("no route")).toBeInTheDocument();
  });
});

describe("SortControls", () => {
  // a date only a link could set had no way to be cleared
  it("has no Date input", () => {
    render(<SortControls value={DEFAULT_RANK} onChange={vi.fn()} />);

    expect(screen.queryByLabelText("Date")).toBeNull();
  });

  it("sorts by walk time or one of three resort sizes", () => {
    render(<SortControls value={DEFAULT_RANK} onChange={vi.fn()} />);

    expect(
      within(screen.getByLabelText("Sort by"))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Walk time", "Total runs", "Skiable area", "Run length"]);
  });

  it("changes the sort key", () => {
    const onChange = vi.fn();
    render(
      <SortControls
        value={{
          sort: "walk_time",
          maxWalkMin: null,
          nightSkiing: false,
          hvPass: false,
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Sort by"), {
      target: { value: "run_length" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "run_length" }),
    );
  });

  it("sets a maximum walk time", () => {
    const onChange = vi.fn();
    render(
      <SortControls
        value={{
          sort: "walk_time",
          maxWalkMin: null,
          nightSkiing: false,
          hvPass: false,
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Max walk"), {
      target: { value: "15" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ maxWalkMin: 15 }),
    );
  });
});
