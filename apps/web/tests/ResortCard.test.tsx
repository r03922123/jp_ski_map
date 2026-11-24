import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { runColor } from "@/components/map/SkiLinesLayer";
import { ResortCard } from "@/components/ResortCard";
import type { ResortSummary } from "@/lib/ski-stats";

// SPEC-ski-runs v1.4: OpenSkiMap's ski-area panel, from the resort's own lines
const summary: ResortSummary = {
  verticalM: 1080,
  lowM: 749,
  highM: 1829,
  runKmByColour: [
    { label: "Easy", colour: runColor("easy"), km: 12.34 },
    { label: "Intermediate", colour: runColor("intermediate"), km: 14 },
    { label: "Advanced", colour: runColor("advanced"), km: 5.06 },
  ],
  totalRunKm: 31.4,
  liftsByType: [
    { liftType: "gondola", count: 1 },
    { liftType: "chair_lift", count: 21 },
  ],
};
const props = {
  name: { en: "Hakuba Happo-One Snow Resort", ja: "白馬八方尾根スキー場" },
  website: "https://www.happo-one.jp/en/",
  onClose: () => {},
};
const value = (label: string) =>
  screen.getByText(label).nextElementSibling?.textContent;

describe("ResortCard", () => {
  it("shows the resort's vertical, runs and lifts, and its website", () => {
    render(<ResortCard {...props} summary={summary} failed={false} />);
    expect(
      screen.getByRole("group", { name: "Hakuba Happo-One Snow Resort" }),
    ).toBeInTheDocument();
    expect(screen.getByText("白馬八方尾根スキー場")).toBeInTheDocument();
    expect(value("Vertical")).toBe("1080 m (749–1829 m)");
    expect(value("Downhill runs")).toContain("31.4 km");
    expect(value("Lifts")).toBe("1 Gondola, 21 Chair lifts");
    expect(screen.getByRole("link", { name: /happo-one\.jp/ })).toHaveAttribute(
      "href",
      "https://www.happo-one.jp/en/",
    );
    expect(
      screen.getByText("Measured from OpenSkiMap's runs and lifts"),
    ).toBeInTheDocument();
  });

  it("gives screen readers the split by difficulty the bar shows", () => {
    render(<ResortCard {...props} summary={summary} failed={false} />);
    expect(
      screen.getByText("Easy 12.3 km, Intermediate 14.0 km, Advanced 5.1 km"),
    ).toHaveClass("sr-only");
  });

  it("says so while the lines load, and when they could not", () => {
    const { rerender } = render(
      <ResortCard {...props} summary={null} failed={false} />,
    );
    expect(screen.getByText("Loading runs and lifts…")).toBeInTheDocument();
    rerender(<ResortCard {...props} summary={null} failed />);
    expect(
      screen.getByText("Couldn't load the runs and lifts."),
    ).toBeInTheDocument();
  });

  it("closes with ✕", () => {
    const onClose = vi.fn();
    render(
      <ResortCard {...props} onClose={onClose} summary={null} failed={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
