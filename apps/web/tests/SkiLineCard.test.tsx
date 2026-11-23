import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  type SkiLine,
  SkiLineCard,
  skiLineFacts,
} from "@/components/SkiLineCard";

// the Kamo 1 lift in data/ski_lines.json; OpenSkiMap shows 890 m, 282 m (751–1033 m), 19° (34%)
const KAMO_1: SkiLine = {
  id: "ffc19ab7af5e864eb0482b0851a897dc222b7584",
  kind: "lift",
  name: "かも１, Kamo 1",
  difficulty: null,
  liftType: "chair_lift",
  resortId: "iwatake",
  lengthM: 839,
  minEleM: 751,
  maxEleM: 1033,
};

describe("skiLineFacts (SPEC-ski-runs v2)", () => {
  it("gives a lift's kind, slope distance, vertical and slope as OpenSkiMap does", () => {
    expect(skiLineFacts(KAMO_1)).toEqual({
      title: "かも１, Kamo 1",
      what: "Chairlift",
      facts: [
        "Distance 885 m",
        "Vertical 282 m (751–1033 m)",
        "Slope 19° (34%)",
      ],
    });
  });

  it("names a run by its difficulty, and an unnamed area run without numbers it lacks", () => {
    expect(
      skiLineFacts({
        ...KAMO_1,
        kind: "run",
        name: null,
        difficulty: "intermediate",
        liftType: null,
        lengthM: null,
      }),
    ).toEqual({
      title: "Unnamed run",
      what: "Intermediate run",
      facts: ["Vertical 282 m (751–1033 m)"],
    });
  });

  it("without elevation, shows the flat length only", () => {
    expect(
      skiLineFacts({ ...KAMO_1, minEleM: null, maxEleM: null }).facts,
    ).toEqual(["Distance 839 m"]);
  });
});

describe("SkiLineCard", () => {
  it("opens the resort from its name, and closes on ✕ and Escape", () => {
    const onSelectResort = vi.fn();
    const onClose = vi.fn();
    render(
      <SkiLineCard
        line={KAMO_1}
        resortName="Hakuba Iwatake"
        onSelectResort={onSelectResort}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Hakuba Iwatake" }));
    expect(onSelectResort).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
