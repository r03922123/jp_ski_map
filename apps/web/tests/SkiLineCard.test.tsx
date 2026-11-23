import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SkiLine } from "@/components/map/SkiLinesLayer";
import { SkiLineCard } from "@/components/SkiLineCard";

// A tap on a run or lift shows what OpenSkiMap knows about it, in the pin card's place
const run: SkiLine = {
  id: "r1",
  kind: "run",
  name: "リーゼンスラローム, Riesen Slalom",
  difficulty: "intermediate",
  liftType: null,
  resortId: "happo-one",
};

describe("SkiLineCard", () => {
  it("names a run in both languages, with its difficulty and resort", () => {
    render(
      <SkiLineCard line={run} resortName="Happo-One" onClose={() => {}} />,
    );
    expect(
      screen.getByRole("group", { name: "リーゼンスラローム" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Riesen Slalom")).toBeInTheDocument();
    expect(
      screen.getByText("Intermediate run · Happo-One"),
    ).toBeInTheDocument();
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
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByRole("group", { name: "Unnamed lift" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Chair lift · Happo-One")).toBeInTheDocument();
  });

  it("a run of unknown difficulty says so", () => {
    render(
      <SkiLineCard
        line={{ ...run, name: null, difficulty: null }}
        resortName="Happo-One"
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByText("Run, difficulty unknown · Happo-One"),
    ).toBeInTheDocument();
  });

  it("closes with ✕ or Escape", () => {
    const onClose = vi.fn();
    render(<SkiLineCard line={run} resortName="Happo-One" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
