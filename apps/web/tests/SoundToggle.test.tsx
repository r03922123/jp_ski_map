import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SoundToggle } from "@/components/SoundToggle";

describe("SoundToggle", () => {
  it("starts off and turns sound on and off", () => {
    render(<SoundToggle />);
    const button = screen.getByRole("button", { name: "Sound effects" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
  });
});
