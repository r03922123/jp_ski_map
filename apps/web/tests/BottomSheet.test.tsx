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

  // T74: on Android a moving touch fires no click afterwards; the swipe itself must act
  const handle = () =>
    screen.getByRole("button", { name: /(Expand|Collapse) directions/ });

  function swipe(fromY: number, toY: number) {
    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: fromY });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: toY });
    fireEvent.pointerUp(handle(), { pointerId: 1, clientY: toY });
  }

  it("a swipe up on the handle expands, a swipe down collapses, with no click", () => {
    renderSheet();
    swipe(500, 400);
    expect(sheet()).toHaveAttribute("data-state", "expanded");
    swipe(400, 500);
    expect(sheet()).toHaveAttribute("data-state", "collapsed");
  });

  it("the click a mouse drag sends afterwards does not toggle it back", () => {
    renderSheet();
    swipe(500, 400);
    fireEvent.click(handle());
    expect(sheet()).toHaveAttribute("data-state", "expanded");
  });

  it("a tap or Enter still toggles", () => {
    renderSheet();
    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 500 });
    fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 502 });
    fireEvent.click(handle());
    expect(sheet()).toHaveAttribute("data-state", "expanded");
    fireEvent.click(handle()); // keyboard activation is a click with no pointer
    expect(sheet()).toHaveAttribute("data-state", "collapsed");
  });

  it("a cancelled touch (the browser took the gesture) changes nothing", () => {
    renderSheet();
    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 500 });
    fireEvent.pointerCancel(handle(), { pointerId: 1, clientY: 400 });
    expect(sheet()).toHaveAttribute("data-state", "collapsed");
    fireEvent.click(handle()); // a later tap is not swallowed
    expect(sheet()).toHaveAttribute("data-state", "expanded");
  });
});
