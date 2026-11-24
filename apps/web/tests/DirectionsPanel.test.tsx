import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
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
  mode: "walk",
  durationS: 516,
  distanceM: 4100,
  geometry: { type: "LineString", coordinates: [] },
  summary: "via 白馬大橋 and 白馬岳線",
  isEstimate: true,
  steps: [
    step({ instruction: "Walk north.", maneuver: "depart", distanceM: 210 }),
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
  // the shell owns the selected route: a pick comes back as the new activeRoute
  function Shell() {
    const [active, setActive] = useState(props.activeRoute);
    return (
      <DirectionsPanel
        {...props}
        activeRoute={active}
        onSelectRoute={(i) => {
          setActive(i);
          props.onSelectRoute(i);
        }}
      />
    );
  }
  render(<Shell />);
  return props;
}

const option = (name: RegExp) => screen.getByRole("button", { name });
const stepsOf = (opt: HTMLElement) =>
  within(opt.closest("li") as HTMLElement).getByRole("list", {
    name: /steps/i,
  });

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

  it("lists one option per route, with the steps hidden at first", () => {
    renderPanel();

    const options = within(
      screen.getByRole("list", { name: "Route options" }),
    ).getAllByRole("button");
    expect(options).toHaveLength(2);
    expect(options[1]).toHaveTextContent("11 min");
    expect(options[1]).toHaveTextContent("via Route 148");
    for (const o of options)
      expect(o).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: /steps/i })).toBeNull();
  });

  it("a click selects the option and opens its steps under it; a second click hides them", () => {
    const props = renderPanel();

    const alt = option(/11 min/);
    fireEvent.click(alt);
    expect(props.onSelectRoute).toHaveBeenCalledWith(1);
    expect(alt).toHaveAttribute("aria-expanded", "true");
    expect(within(stepsOf(alt)).getAllByRole("listitem")).toHaveLength(2);

    fireEvent.click(alt);
    expect(alt).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: /steps/i })).toBeNull();
  });

  it("keeps one option open at a time", () => {
    renderPanel();

    fireEvent.click(option(/9 min/));
    fireEvent.click(option(/11 min/));
    expect(option(/9 min/)).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("list", { name: /steps/i })).toHaveLength(1);
    expect(stepsOf(option(/11 min/))).toBeInTheDocument();
  });

  // review of feat/panel-tidy: the open option outlived a pick on the map and a new route set
  it("closes the steps when the route changes from outside; only a click opens them", () => {
    const props: DirectionsPanelProps = {
      routes: [primary, alternate],
      activeRoute: 0,
      onSelectRoute: vi.fn(),
      onHighlightStep: vi.fn(),
      departAt: new Date("2026-03-20T08:00:00+09:00"),
    };
    const { rerender } = render(<DirectionsPanel {...props} />);
    fireEvent.click(option(/9 min/));
    expect(stepsOf(option(/9 min/))).toBeInTheDocument();

    // picked on the map, then picked back
    rerender(<DirectionsPanel {...props} activeRoute={1} />);
    expect(screen.queryByRole("list", { name: /steps/i })).toBeNull();
    rerender(<DirectionsPanel {...props} activeRoute={0} />);
    expect(screen.queryByRole("list", { name: /steps/i })).toBeNull();

    // a new start or destination: a new route set, back on its first route
    fireEvent.click(option(/9 min/));
    rerender(
      <DirectionsPanel
        {...props}
        routes={[{ ...primary }, { ...alternate }]}
      />,
    );
    expect(option(/9 min/)).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: /steps/i })).toBeNull();
  });

  it("shows the option list with a single route too", () => {
    renderPanel({ routes: [primary] });

    fireEvent.click(option(/9 min/));
    expect(stepsOf(option(/9 min/))).toBeInTheDocument();
  });

  it("shows a maneuver icon and a distance for each step", () => {
    renderPanel();
    fireEvent.click(option(/9 min/));

    const items = within(stepsOf(option(/9 min/))).getAllByRole("listitem");
    expect(items).toHaveLength(5); // collapsed after 5
    expect(items[1]).toHaveTextContent("Turn right onto 白馬大橋.");
    expect(items[1]).toHaveTextContent("1.7 km");
    expect(items[1].querySelector("[data-maneuver='right']")).not.toBeNull();
    expect(items[0]).toHaveTextContent("210 m");
  });

  it("expands to every step on request", () => {
    renderPanel();
    fireEvent.click(option(/9 min/));

    fireEvent.click(screen.getByRole("button", { name: /all 7 steps/i }));

    expect(
      within(stepsOf(option(/9 min/))).getAllByRole("listitem"),
    ).toHaveLength(7);
  });

  it("highlights a step's segment on hover and focus, and clears it", () => {
    const props = renderPanel();
    fireEvent.click(option(/9 min/));
    const second = within(
      within(stepsOf(option(/9 min/))).getAllByRole("listitem")[1],
    ).getByRole("button");

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
