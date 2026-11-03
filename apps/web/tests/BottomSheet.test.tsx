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

  // v1.9 rule 5 (recorded change; was "expands when the search box above the list is
  // focused"): the header sits on top of the map on phones, its suggestions drop over the
  // map, so focusing it leaves the sheet's size alone
  it("focusing the header (From/To on top) leaves the sheet as it is", () => {
    renderSheet();
    expect(sheet()).toHaveAttribute("data-state", "collapsed");
    fireEvent.focus(screen.getByRole("textbox", { name: "Search" }));
    expect(sheet()).toHaveAttribute("data-state", "collapsed");
  });

  // v1.9 rule 4 (cluster F): a new destination collapses the sheet so the route shows
  it("a new collapseKey collapses an expanded sheet; the same key leaves it", () => {
    const view = render(
      <BottomSheet label="Directions" collapseKey="happo-one">
        <p>list</p>
      </BottomSheet>,
    );
    fireEvent.click(handle());
    expect(sheet()).toHaveAttribute("data-state", "expanded");
    view.rerender(
      <BottomSheet label="Directions" collapseKey="happo-one">
        <p>list</p>
      </BottomSheet>,
    );
    expect(sheet()).toHaveAttribute("data-state", "expanded");
    view.rerender(
      <BottomSheet label="Directions" collapseKey="cortina">
        <p>list</p>
      </BottomSheet>,
    );
    expect(sheet()).toHaveAttribute("data-state", "collapsed");
  });

  it("expands for a box inside the list too (a trip stop needs room for suggestions)", () => {
    renderSheet();
    fireEvent.focus(screen.getByRole("textbox", { name: "Stop 1" }));
    expect(sheet()).toHaveAttribute("data-state", "expanded");
  });

  // found by e2e (v1.9): the sheet now rests collapsed, and a tapped checkbox (Night bus)
  // took focus, grew the sheet mid-tap and moved out from under the finger: the tap was
  // lost. Only a box you type in needs the room for suggestions.
  it("stays as it is when a checkbox or a date field in the list is focused", () => {
    render(
      <BottomSheet label="Directions">
        <input type="checkbox" aria-label="Night bus" />
        <input type="datetime-local" aria-label="Leave after" />
      </BottomSheet>,
    );
    fireEvent.focus(screen.getByRole("checkbox", { name: "Night bus" }));
    expect(sheet()).toHaveAttribute("data-state", "collapsed");
    fireEvent.focus(screen.getByLabelText("Leave after"));
    expect(sheet()).toHaveAttribute("data-state", "collapsed");
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
    fireEvent.click(handle()); // expanded (v1.9: focusing the header no longer expands)
    scrolledTo(120);
    expect(drag(body(), 300, 400)).toBe(true);
    expect(sheet()).toHaveAttribute("data-state", "expanded");
  });

  it("on an expanded sheet an upward drag is left to the list", () => {
    renderSheet();
    fireEvent.click(handle()); // expanded (v1.9: focusing the header no longer expands)
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

  // code review of v1.9: the From/To suggestions drop from the top card, outside the
  // body. With the sheet resting collapsed, the sheet owned every drag on them, so a
  // finger couldn't scroll the list (nor reach rows under the iOS keyboard)
  describe("a suggestion list in the top card", () => {
    function renderWithList(scrollTop: number) {
      render(
        <BottomSheet
          label="Directions"
          header={
            <div role="listbox" aria-label="Search results">
              <div role="option" aria-selected={false}>
                Hakuba Cortina
              </div>
            </div>
          }
        >
          <p>list</p>
        </BottomSheet>,
      );
      const list = screen.getByRole("listbox", { name: "Search results" });
      Object.defineProperty(list, "scrollTop", {
        configurable: true,
        value: scrollTop,
      });
      return list;
    }

    it("an upward drag scrolls the list (the collapsed sheet doesn't take it)", () => {
      const list = renderWithList(0);
      expect(drag(list, 400, 300)).toBe(true);
      expect(sheet()).toHaveAttribute("data-state", "collapsed");
    });

    it("a downward drag in a list scrolled down scrolls the list back", () => {
      const list = renderWithList(120);
      expect(drag(list, 300, 400)).toBe(true);
    });

    it("a downward drag at the list's top keeps Safari's pull away, without resizing the sheet", () => {
      const list = renderWithList(0);
      expect(drag(list, 300, 400)).toBe(false);
      expect(sheet()).toHaveAttribute("data-state", "collapsed");
    });
  });

  it("a short downward wobble keeps Safari out but does not collapse", () => {
    renderSheet();
    fireEvent.click(handle()); // expanded (v1.9: focusing the header no longer expands)
    scrolledTo(0);
    expect(drag(body(), 300, 310)).toBe(false);
    expect(sheet()).toHaveAttribute("data-state", "expanded");
  });

  it("a cancelled downward drag (the system took the touch) does not collapse", () => {
    renderSheet();
    fireEvent.click(handle()); // expanded (v1.9: focusing the header no longer expands)
    scrolledTo(0);
    fireEvent.touchStart(body(), { touches: [{ clientY: 300 }] });
    fireEvent.touchMove(body(), { touches: [{ clientY: 400 }] });
    fireEvent.touchCancel(body(), { changedTouches: [{ clientY: 400 }] });
    expect(sheet()).toHaveAttribute("data-state", "expanded");
  });
});
