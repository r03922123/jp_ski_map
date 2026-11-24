import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SkiLine, SkiLineFeature } from "@/components/map/SkiLinesLayer";
import { SkiLineCard } from "@/components/SkiLineCard";

// A tap on a run or lift shows what OpenSkiMap knows about it, in the pin card's place
const run: SkiLine = {
  id: "r1",
  kind: "run",
  name: "リーゼンスラローム, Riesen Slalom",
  difficulty: "intermediate",
  liftType: null,
  resortId: "happo-one",
  distanceM: 1355,
  minElevationM: 1256,
  maxElevationM: 1672,
  slopePct: 32,
  durationS: null,
};

// the line under the title: "Intermediate run · <resort button>"
const kindLine = () =>
  screen.getByRole("button", { name: "Happo-One" }).parentElement?.textContent;

// the whole line from the query (SPEC-ski-runs v1.4): 3 heights 50 m apart, due north
const full: SkiLineFeature = {
  type: "Feature",
  properties: {
    ...run,
    profile: { heightsM: [1672, 1660, 1645], resolutionM: 50 },
  },
  geometry: {
    type: "LineString",
    coordinates: [
      [137.8, 36.7],
      [137.8, 36.7009],
    ],
  },
};

describe("SkiLineCard", () => {
  it("names a run in both languages, with its difficulty and resort", () => {
    render(
      <SkiLineCard
        line={run}
        resortName="Happo-One"
        onResort={() => {}}
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByRole("group", { name: "リーゼンスラローム" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Riesen Slalom")).toBeInTheDocument();
    expect(kindLine()).toBe("Intermediate run · Happo-One");
  });

  it("says what kind of lift it is, and copes with no name", () => {
    render(
      <SkiLineCard
        line={{
          ...run,
          kind: "lift",
          name: null,
          difficulty: null,
          liftType: "chair_lift",
        }}
        resortName="Happo-One"
        onResort={() => {}}
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByRole("group", { name: "Unnamed lift" }),
    ).toBeInTheDocument();
    expect(kindLine()).toBe("Chair lift · Happo-One");
  });

  it("a run of unknown difficulty says so", () => {
    render(
      <SkiLineCard
        line={{ ...run, name: null, difficulty: null }}
        resortName="Happo-One"
        onResort={() => {}}
        onClose={() => {}}
      />,
    );
    expect(kindLine()).toBe("Run, difficulty unknown · Happo-One");
  });

  // SPEC-ski-runs v1.2: OpenSkiMap's numbers, as label and value
  it("lists the run's distance, vertical and slope", () => {
    render(
      <SkiLineCard
        line={run}
        resortName="Happo-One"
        onResort={() => {}}
        onClose={() => {}}
      />,
    );
    const value = (label: string) =>
      screen.getByText(label).nextElementSibling?.textContent;
    expect(value("Distance")).toBe("1.36 km");
    expect(value("Vertical")).toBe("416 m (1256–1672 m)");
    expect(value("Slope (average)")).toBe("18° (32%)");
    expect(screen.queryByText("Ride time")).toBeNull();
  });

  it("closes with ✕ or Escape", () => {
    const onClose = vi.fn();
    render(
      <SkiLineCard
        line={run}
        resortName="Happo-One"
        onResort={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  // v1.4: the resort name opens the resort card
  it("the resort name opens the resort's card", () => {
    const onResort = vi.fn();
    render(
      <SkiLineCard
        line={run}
        resortName="Happo-One"
        onResort={onResort}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Happo-One" }));
    expect(onResort).toHaveBeenCalledOnce();
  });

  it("shows no chart until the whole line is there", () => {
    render(
      <SkiLineCard
        line={run}
        resortName="Happo-One"
        onResort={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByText("Ascent")).toBeNull();
  });

  it("with the whole line, adds the profile's numbers and its chart", () => {
    render(
      <SkiLineCard
        line={run}
        full={full}
        resortName="Happo-One"
        onResort={() => {}}
        onClose={() => {}}
      />,
    );
    const value = (label: string) =>
      screen.getByText(label).nextElementSibling?.textContent;
    expect(value("Ascent")).toBe("0 m");
    expect(value("Descent")).toBe("27 m");
    expect(value("Max slope")).toBe("17° (30%)");
    expect(
      screen.getByRole("slider", { name: "Height profile" }),
    ).toBeInTheDocument();
  });

  it("moving over the chart reports the map point and the height and slope there", () => {
    const onPoint = vi.fn();
    render(
      <SkiLineCard
        line={run}
        full={full}
        resortName="Happo-One"
        onResort={() => {}}
        onClose={() => {}}
        onPoint={onPoint}
      />,
    );
    const chart = screen.getByRole("slider", { name: "Height profile" });
    chart.getBoundingClientRect = () =>
      ({ left: 0, width: 200, top: 0, height: 80 }) as DOMRect;
    fireEvent.pointerMove(chart, { clientX: 100, clientY: 10 });
    // the middle of 3 heights: half way along the line
    const [at] = onPoint.mock.calls.at(-1) ?? [];
    expect(at.lng).toBeCloseTo(137.8, 6);
    expect(at.lat).toBeCloseTo(36.70045, 6);
    expect(chart).toHaveAttribute(
      "aria-valuetext",
      "1660 m · 17° (30%), 0.05 km along",
    );
    expect(screen.getByText("1660 m · 17° (30%)")).toBeInTheDocument();
    fireEvent.pointerLeave(chart);
    expect(onPoint).toHaveBeenLastCalledWith(null);
  });

  it("arrow keys walk the chart from the keyboard", () => {
    const onPoint = vi.fn();
    render(
      <SkiLineCard
        line={run}
        full={full}
        resortName="Happo-One"
        onResort={() => {}}
        onClose={() => {}}
        onPoint={onPoint}
      />,
    );
    const chart = screen.getByRole("slider", { name: "Height profile" });
    fireEvent.keyDown(chart, { key: "End" });
    expect(chart).toHaveAttribute("aria-valuenow", "100");
    expect(onPoint.mock.calls.at(-1)?.[0].lat).toBeCloseTo(36.7009, 6);
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(chart).toHaveAttribute("aria-valuenow", "50");
    fireEvent.blur(chart);
    expect(onPoint).toHaveBeenLastCalledWith(null);
  });
});
