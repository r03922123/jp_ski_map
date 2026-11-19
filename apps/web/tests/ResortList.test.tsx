import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render as rtlRender,
  screen,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ResortList } from "@/components/ResortList";
import { SortControls } from "@/components/SortControls";
import type { RankedResort } from "@/lib/api";

// resort cards carry a Check in button, which reads the resort catalog
const render = (ui: ReactElement) =>
  rtlRender(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>,
  );

function ranked(overrides: Partial<RankedResort> = {}): RankedResort {
  return {
    resortId: "happo-one",
    name: "Hakuba Happo-One Snow Resort",
    rank: 1,
    sortValue: 368,
    driveS: 368,
    driveDistanceM: 2500,
    accessPointId: "happo-one-adam-gondola",
    factors: {
      driveTime: 368,
      freshSnow: 46.8,
      snowDepth: 299,
      crowd: 0.6,
      terrainSize: 16,
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
  it("shows rank, name, drive ETA, snow and an estimated crowd badge", () => {
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

  it("expands to every factor, crowd reasons and the snow timestamp", () => {
    render(
      <ResortList resorts={[ranked()]} selectedId={null} onSelect={vi.fn()} />,
    );

    fireEvent.click(screen.getByText(/details/i));

    expect(screen.getByText("Vertical drop")).toBeInTheDocument();
    expect(screen.getByText("1071 m")).toBeInTheDocument();
    expect(screen.getByText("Ticket price").nextSibling).toHaveTextContent("—");
    expect(screen.getByText(/Crowd estimate:/)).toHaveTextContent(
      /Coming of Age Day/,
    );
    expect(
      screen.getByText(/snow model as of 01\/12 07:00/i),
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
        resorts={[ranked({ driveS: null, sortValue: null })]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("no route")).toBeInTheDocument();
  });
});

describe("SortControls", () => {
  it("changes the sort key", () => {
    const onChange = vi.fn();
    render(
      <SortControls
        value={{
          sort: "drive_time",
          date: null,
          maxDriveMin: null,
          nightSkiing: false,
          hvPass: false,
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Sort by"), {
      target: { value: "fresh_snow" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "fresh_snow" }),
    );
  });

  it("sets a maximum drive time", () => {
    const onChange = vi.fn();
    render(
      <SortControls
        value={{
          sort: "drive_time",
          date: null,
          maxDriveMin: null,
          nightSkiing: false,
          hvPass: false,
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Max drive"), {
      target: { value: "15" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ maxDriveMin: 15 }),
    );
  });
});
