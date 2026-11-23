import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PinCard } from "@/components/PinCard";
import { SaveButton } from "@/components/SaveButton";

// BC-A1: a long-press drops a pin with a card; only a button on the card edits the trip.
// Ours offers Start here (where am I staying), Go here and Add stop when they apply.
const AT = { lat: 36.698501, lng: 137.837612 };

describe("PinCard", () => {
  // Google's dropped-pin sheet (BC-A1) shows where the pin is under its title
  it("shows the pin's coordinates under its name", () => {
    render(
      <PinCard name={null} coord={AT} onStart={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByText("36.69850, 137.83761")).toBeInTheDocument();
  });

  const handlers = () => ({
    onStart: vi.fn(),
    onGo: vi.fn(),
    onAddStop: vi.fn(),
    onClose: vi.fn(),
  });

  it("names the place, or says Dropped pin, and each button does its one thing", () => {
    const h = handlers();
    const { rerender } = render(<PinCard name={null} coord={AT} {...h} />);
    expect(screen.getByRole("group", { name: "Dropped pin" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start here" }));
    fireEvent.click(screen.getByRole("button", { name: "Go here" }));
    fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
    expect(h.onStart).toHaveBeenCalledTimes(1);
    expect(h.onGo).toHaveBeenCalledTimes(1);
    expect(h.onAddStop).toHaveBeenCalledTimes(1);
    rerender(<PinCard name="Hotel Hakuba" coord={AT} {...h} />);
    expect(screen.getByRole("group", { name: "Hotel Hakuba" })).toBeTruthy();
  });

  it("offers only what applies: no Go here in Bus, no Add stop without a destination", () => {
    render(
      <PinCard name={null} coord={AT} onStart={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Start here" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Go here" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add stop" })).toBeNull();
  });

  it("closes with ✕ or Escape", () => {
    const h = handlers();
    render(<PinCard name={null} coord={AT} {...h} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(h.onClose).toHaveBeenCalledTimes(2);
  });

  // T2: Directions (Go here) is the one prominent action; Save sits beside the others
  it("makes Go here the prominent action and shows the Save slot", () => {
    render(
      <PinCard
        name={null}
        coord={AT}
        onStart={() => {}}
        onGo={() => {}}
        onClose={() => {}}
        save={<button type="button">Save Dropped pin</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Go here" })).toHaveAttribute(
      "data-variant",
      "primary",
    );
    expect(screen.getByRole("button", { name: "Start here" })).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    expect(
      screen.getByRole("button", { name: "Save Dropped pin" }),
    ).toBeInTheDocument();
  });

  it("with no Go here (Bus), Start here is the prominent one", () => {
    render(
      <PinCard name={null} coord={AT} onStart={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Start here" })).toHaveAttribute(
      "data-variant",
      "primary",
    );
  });

  // review of #115: Escape closes the list picker only, not the pin card under it
  it("Escape in its Save dialog leaves the pin card open", () => {
    const onClose = vi.fn();
    render(
      <PinCard
        name={null}
        coord={AT}
        onStart={() => {}}
        onClose={onClose}
        save={
          <SaveButton
            place={{
              id: "pt:36.68000,137.86000",
              name: "Dropped pin",
              coord: { lat: 36.68, lng: 137.86 },
              kind: "pin",
            }}
          />
        }
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save Dropped pin" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});
