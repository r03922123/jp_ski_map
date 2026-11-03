import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PinCard } from "@/components/PinCard";

// BC-A1: a long-press drops a pin with a card; only a button on the card edits the trip.
// Ours offers Start here (where am I staying), Go here and Add stop when they apply.
describe("PinCard", () => {
  const handlers = () => ({
    onStart: vi.fn(),
    onGo: vi.fn(),
    onAddStop: vi.fn(),
    onClose: vi.fn(),
  });

  it("names the place, or says Dropped pin, and each button does its one thing", () => {
    const h = handlers();
    const { rerender } = render(<PinCard name={null} {...h} />);
    expect(screen.getByRole("group", { name: "Dropped pin" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start here" }));
    fireEvent.click(screen.getByRole("button", { name: "Go here" }));
    fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
    expect(h.onStart).toHaveBeenCalledTimes(1);
    expect(h.onGo).toHaveBeenCalledTimes(1);
    expect(h.onAddStop).toHaveBeenCalledTimes(1);
    rerender(<PinCard name="Hotel Hakuba" {...h} />);
    expect(screen.getByRole("group", { name: "Hotel Hakuba" })).toBeTruthy();
  });

  it("offers only what applies: no Go here in Bus, no Add stop without a destination", () => {
    render(<PinCard name={null} onStart={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Start here" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Go here" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add stop" })).toBeNull();
  });

  it("closes with ✕ or Escape", () => {
    const h = handlers();
    render(<PinCard name={null} {...h} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(h.onClose).toHaveBeenCalledTimes(2);
  });
});
