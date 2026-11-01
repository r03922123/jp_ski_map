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

  // T79: on iPhone, a downward drag on the sheet whose list is already at the top went
  // to Safari as pull-to-refresh and reloaded the trip. Like a native iOS sheet (and
  // Vaul's shouldDrag), the sheet owns that drag; who owns it is decided at touch start.
  const body = () => {
    const el = sheet().querySelector<HTMLElement>("[data-sheet-body]");
    if (!el) throw new Error("no sheet body");
    return el;
  };

  function scrolledTo(top: number) {
    Object.defineProperty(body(), "scrollTop", {
      configurable: true,
      value: top,
    });
  }

  /** Returns whether the browser may still act on the move (false = the sheet took it). */
  function drag(target: Element, fromY: number, toY: number) {
    fireEvent.touchStart(target, { touches: [{ clientY: fromY }] });
    const browserMayAct = fireEvent.touchMove(target, {
      touches: [{ clientY: toY }],
    });
    fireEvent.touchEnd(target, { changedTouches: [{ clientY: toY }] });
    return browserMayAct;
  }

  it("a downward drag in the list at its top is the sheet's: Safari never sees a pull, the sheet collapses", () => {
    renderSheet();
    fireEvent.focus(screen.getByRole("textbox", { name: "Search" })); // expanded
    scrolledTo(0);
    expect(
      drag(screen.getByRole("button", { name: "Add stop" }), 300, 400),
    ).toBe(false);
    expect(sheet()).toHaveAttribute("data-state", "collapsed");
  });

  it("a collapsed sheet still keeps the pull from Safari", () => {
    renderSheet();
    scrolledTo(0);
    expect(drag(body(), 300, 400)).toBe(false);
    expect(sheet()).toHaveAttribute("data-state", "collapsed");
  });

  it("a downward drag in a list scrolled down scrolls the list, as before", () => {
    renderSheet();
    fireEvent.focus(screen.getByRole("textbox", { name: "Search" }));
    scrolledTo(120);
    expect(drag(body(), 300, 400)).toBe(true);
    expect(sheet()).toHaveAttribute("data-state", "expanded");
  });

  it("on an expanded sheet an upward drag is left to the list", () => {
    renderSheet();
    fireEvent.focus(screen.getByRole("textbox", { name: "Search" }));
    scrolledTo(0);
    expect(drag(body(), 400, 300)).toBe(true);
    expect(sheet()).toHaveAttribute("data-state", "expanded");
  });

  // iPhone QA: an upward swipe on the collapsed sheet bounced the whole page and left the
  // sheet small. UIKit sheets expand first (prefersScrollingExpandsWhenScrolledToEdge).
  it("on a collapsed sheet an upward drag is the sheet's: it expands, the page does not bounce", () => {
    renderSheet();
    scrolledTo(0);
    expect(drag(body(), 400, 300)).toBe(false);
    expect(sheet()).toHaveAttribute("data-state", "expanded");
  });

  it("a collapsed sheet expands from an upward drag even with its list scrolled", () => {
    renderSheet();
    scrolledTo(80);
    expect(drag(body(), 400, 300)).toBe(false);
    expect(sheet()).toHaveAttribute("data-state", "expanded");
  });

  it("a downward drag on the header (search box) is the sheet's too", () => {
    renderSheet();
    fireEvent.focus(screen.getByRole("textbox", { name: "Search" }));
    expect(
      drag(screen.getByRole("textbox", { name: "Search" }), 300, 400),
    ).toBe(false);
    expect(sheet()).toHaveAttribute("data-state", "collapsed");
  });

  it("a short downward wobble keeps Safari out but does not collapse", () => {
    renderSheet();
    fireEvent.focus(screen.getByRole("textbox", { name: "Search" }));
    scrolledTo(0);
    expect(drag(body(), 300, 310)).toBe(false);
    expect(sheet()).toHaveAttribute("data-state", "expanded");
  });

  it("a cancelled downward drag (the system took the touch) does not collapse", () => {
    renderSheet();
    fireEvent.focus(screen.getByRole("textbox", { name: "Search" }));
    scrolledTo(0);
    fireEvent.touchStart(body(), { touches: [{ clientY: 300 }] });
    fireEvent.touchMove(body(), { touches: [{ clientY: 400 }] });
    fireEvent.touchCancel(body(), { changedTouches: [{ clientY: 400 }] });
    expect(sheet()).toHaveAttribute("data-state", "expanded");
  });
});
