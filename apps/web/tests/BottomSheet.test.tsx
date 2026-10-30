import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BottomSheet } from "@/components/BottomSheet";

describe("BottomSheet", () => {
  const sheet = () => screen.getByRole("region", { name: "Directions" });

  function renderSheet() {
    render(
      <BottomSheet label="Directions" header={<input aria-label="Search" />}>
        <input aria-label="Stop 1" />
        <button type="button">Add stop</button>
      </BottomSheet>,
    );
  }

  it("expands when the search box above the list is focused", () => {
    renderSheet();
    expect(sheet()).toHaveAttribute("data-state", "collapsed");
    fireEvent.focus(screen.getByRole("textbox", { name: "Search" }));
    expect(sheet()).toHaveAttribute("data-state", "expanded");
  });

  it("expands for a box inside the list too (a trip stop needs room for suggestions)", () => {
    renderSheet();
    fireEvent.focus(screen.getByRole("textbox", { name: "Stop 1" }));
    expect(sheet()).toHaveAttribute("data-state", "expanded");
  });

  it("stays as it is when a button in the list is focused", () => {
    renderSheet();
    fireEvent.focus(screen.getByRole("button", { name: "Add stop" }));
    expect(sheet()).toHaveAttribute("data-state", "collapsed");
  });
});
