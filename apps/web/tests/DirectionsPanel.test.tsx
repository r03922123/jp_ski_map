import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DirectionsPanel,
  type DirectionsPanelProps,
} from "@/components/DirectionsPanel";
import type { Route, Step } from "@/lib/api";

function step(overrides: Partial<Step>): Step {
  return {
    instruction: "Continue.",
    distanceM: 300,
    durationS: 30,
    maneuver: "straight",
    streetNames: [],
    shapeRange: [0, 1],
    ...overrides,
  };
}

const primary: Route = {
  mode: "drive",
  durationS: 516,
  distanceM: 4100,
  geometry: { type: "LineString", coordinates: [] },
  summary: "via 白馬大橋 and 白馬岳線",
  isEstimate: true,
  steps: [
    step({ instruction: "Drive north.", maneuver: "depart", distanceM: 210 }),
    step({
      instruction: "Turn right onto 白馬大橋.",
      maneuver: "right",
      distanceM: 1650,
      shapeRange: [1, 5],
    }),
    step({ instruction: "Turn left.", maneuver: "left", distanceM: 1230 }),
    step({ instruction: "Continue.", maneuver: "straight", distanceM: 400 }),
    step({
      instruction: "Keep right.",
      maneuver: "keep-right",
      distanceM: 400,
    }),
    step({
      instruction: "Bear left.",
      maneuver: "slight-left",
      distanceM: 200,
    }),
    step({
      instruction: "You have arrived.",
      maneuver: "arrive",
      distanceM: 0,
    }),
  ],
};
const alternate: Route = {
  ...primary,
  durationS: 641,
  distanceM: 6200,
  summary: "via Route 148",
  steps: [primary.steps[0], primary.steps[6]],
};

function renderPanel(overrides: Partial<DirectionsPanelProps> = {}) {
  const props: DirectionsPanelProps = {
    routes: [primary, alternate],
    activeRoute: 0,
    onSelectRoute: vi.fn(),
    onHighlightStep: vi.fn(),
    departAt: new Date("2026-03-20T08:00:00+09:00"),
    ...overrides,
  };
  render(<DirectionsPanel {...props} />);
  return props;
}

describe("DirectionsPanel", () => {
  it("headlines the ETA as an estimate, with distance, via and arrival", () => {
    renderPanel();

    expect(screen.getByText("ETA ~ 9 min · 4.1 km")).toBeInTheDocument();
    expect(
      screen.getAllByText("via 白馬大橋 and 白馬岳線")[0],
    ).toBeInTheDocument();
    expect(screen.getByText(/arrive ~ ?08:09/i)).toBeInTheDocument();
    expect(screen.getByText(/no live traffic/i)).toBeInTheDocument();
  });

  it("offers one option per route and selects on click", () => {
    const props = renderPanel();

    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(2);
    expect(options[0]).toBeChecked();
    expect(options[1].closest("label")).toHaveTextContent("11 min");
    expect(options[1].closest("label")).toHaveTextContent("via Route 148");

    fireEvent.click(options[1]);

    expect(props.onSelectRoute).toHaveBeenCalledWith(1);
  });

  it("hides the option list when there is a single route", () => {
    renderPanel({ routes: [primary] });

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("shows a maneuver icon and a distance for each step", () => {
    renderPanel();

    const steps = screen.getByRole("list", { name: /steps/i });
    const items = within(steps).getAllByRole("listitem");
    expect(items).toHaveLength(5); // collapsed after 5
    expect(items[1]).toHaveTextContent("Turn right onto 白馬大橋.");
    expect(items[1]).toHaveTextContent("1.7 km");
    expect(items[1].querySelector("[data-maneuver='right']")).not.toBeNull();
    expect(items[0]).toHaveTextContent("210 m");
  });

  it("expands to every step on request", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /all 7 steps/i }));

    const steps = screen.getByRole("list", { name: /steps/i });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(7);
  });

  it("highlights a step's segment on hover and focus, and clears it", () => {
    const props = renderPanel();
    const steps = screen.getByRole("list", { name: /steps/i });
    const second = within(within(steps).getAllByRole("listitem")[1]).getByRole(
      "button",
    );

    fireEvent.mouseEnter(second);
    expect(props.onHighlightStep).toHaveBeenLastCalledWith([1, 5]);
    fireEvent.mouseLeave(second);
    expect(props.onHighlightStep).toHaveBeenLastCalledWith(null);
    fireEvent.focus(second);
    expect(props.onHighlightStep).toHaveBeenLastCalledWith([1, 5]);
  });

  it("warns about long walks", () => {
    renderPanel({
      routes: [{ ...primary, mode: "walk", durationS: 50 * 60 }],
    });

    expect(screen.getByText(/long walk/i)).toBeInTheDocument();
  });
});
