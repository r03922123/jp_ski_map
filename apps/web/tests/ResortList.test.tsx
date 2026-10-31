import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
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
      crowd: 0.62,
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
      score: 0.62,
      source: "heuristic",
      isEstimate: true,
      reasons: ["3-day weekend (Coming of Age Day)", "Large, popular resort"],
    },
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
    expect(screen.getByText(/Coming of Age Day/)).toBeInTheDocument();
    expect(
      screen.getByText(/snow model as of 01\/12 07:00/i),
    ).toBeInTheDocument();
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
