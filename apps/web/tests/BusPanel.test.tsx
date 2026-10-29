import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BusPanel, type BusPanelProps } from "@/components/BusPanel";
import type { BusResult, Resort } from "@/lib/api";
import fixture from "../e2e/fixtures/bus-options-2026-03-20.json";

const resorts = [
  { id: "hakuba47", name: { en: "Hakuba47 Mountain Resort", ja: "" } },
  {
    id: "kashimayari",
    name: { en: "Kashimayari Ski Resort Family Park", ja: "" },
  },
] as unknown as Resort[];

function renderPanel(overrides: Partial<BusPanelProps> = {}) {
  const props: BusPanelProps = {
    resorts,
    result: { status: "success", data: fixture as BusResult },
    night: { status: "idle" },
    showNight: false,
    onShowNightChange: vi.fn(),
    departAt: "2026-03-20T08:00",
    onDepartAtChange: vi.fn(),
    selected: null,
    onSelect: vi.fn(),
    ...overrides,
  };
  render(<BusPanel {...props} />);
  return props;
}

describe("BusPanel", () => {
  it("lists each resort with its next departures", () => {
    renderPanel();

    const card = screen.getByRole("region", {
      name: "Hakuba47 Mountain Resort",
    });
    expect(within(card).getByText("08:11 → 08:39")).toBeInTheDocument();
    expect(
      within(card).getAllByText(/Hakuba Happo Bus Terminal/).length,
    ).toBeGreaterThan(0);
  });

  it("shows walk and wait for an option", () => {
    renderPanel();

    const card = screen.getByRole("region", {
      name: "Hakuba47 Mountain Resort",
    });
    expect(
      within(card).getAllByText(/walk <1 min · wait 11 min/).length,
    ).toBeGreaterThan(0);
  });

  it("selects an option", () => {
    const props = renderPanel();

    const card = screen.getByRole("region", {
      name: "Hakuba47 Mountain Resort",
    });
    fireEvent.click(within(card).getAllByRole("button")[0]);

    expect(props.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        resortId: "hakuba47",
        boardStopId: "stop-happo-bus-terminal",
      }),
    );
  });

  it("always shows the source and the may-change notice", () => {
    renderPanel();

    expect(
      screen.getByRole("link", { name: /hakuba valley shuttle/i }),
    ).toHaveAttribute(
      "href",
      "https://www.hakubavalley.com/en/access_en/shuttlebus_en/",
    );
    expect(screen.getByText(/may change without notice/i)).toBeInTheDocument();
  });

  it("says when stop times are not published", () => {
    const untimed = structuredClone(fixture) as BusResult;
    const option = untimed.resorts[0].options[0];
    option.timed = false;
    option.arrivesAt = null;
    option.firstStopName = "Hotel Oak Forest";
    renderPanel({ result: { status: "success", data: untimed } });

    expect(
      screen.getAllByText(/stop times not published/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/departs Hotel Oak Forest/i).length,
    ).toBeGreaterThan(0);
  });

  it("explains out-of-season dates", () => {
    renderPanel({
      result: {
        status: "success",
        data: { status: "no_service", nextServiceDate: null, resorts: [] },
      },
    });

    expect(
      screen.getByText(/no shuttle service on this date/i),
    ).toBeInTheDocument();
  });

  it("explains timetables that still await review", () => {
    renderPanel({
      result: {
        status: "success",
        data: { status: "awaiting_review", nextServiceDate: null, resorts: [] },
      },
    });

    expect(screen.getByText(/awaiting review/i)).toBeInTheDocument();
  });

  it("toggles the night bus", () => {
    const props = renderPanel();

    fireEvent.click(screen.getByLabelText(/night bus/i));

    expect(props.onShowNightChange).toHaveBeenCalledWith(true);
  });
});
