"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const DRAG_THRESHOLD_PX = 30;
const SWIPE_CLICK_MS = 400;

/** Bottom sheet on phones (collapsed / expanded), floating card from `md` up. */
export function BottomSheet({
  label,
  header,
  collapseKey,
  revealKey,
  children,
}: {
  label: string;
  /**
   * The trip's From/To (SPEC-web-app v1.9, BC-L1): a card fixed to the top of the map on
   * phones, like Google's route preview, and the top of the side card from `md` up.
   * Outside the scroll area, so its dropdowns are not clipped.
   */
  header?: ReactNode;
  /** A new value collapses the sheet: a new destination shows its route (cluster F). */
  collapseKey?: string;
  /** The route on screen; "" when there is none. Only a route appearing collapses the sheet. */
  revealKey?: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const lastCollapseKey = useRef(collapseKey);
  useEffect(() => {
    if (collapseKey === lastCollapseKey.current) return;
    lastCollapseKey.current = collapseKey;
    setExpanded(false);
  }, [collapseKey]);
  const lastRevealKey = useRef(revealKey);
  useEffect(() => {
    if (revealKey === lastRevealKey.current) return;
    lastRevealKey.current = revealKey;
    if (revealKey) setExpanded(false);
  }, [revealKey]);
  const dragStartY = useRef<number | null>(null);
  // a mouse drag still sends a click afterwards; it must not undo the swipe. (A moving
  // touch on Android sends none, so the swipe acts on pointerup, not on click.)
  const swipedAt = useRef(Number.NEGATIVE_INFINITY);
  const sectionRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  // T79: iPhone Safari took a downward drag on a sheet whose list was at its top as
  // pull-to-refresh (overscroll-behavior does not stop it there: WebKit bug 275947), and
  // an upward swipe on the collapsed sheet bounced the page instead of expanding it.
  // Like a UIKit sheet (prefersScrollingExpandsWhenScrolledToEdge) and Vaul's shouldDrag,
  // the sheet owns a drag down from a list at its top, and a drag up while collapsed.
  // Who owns it is decided when the touch starts and on its first move, so a flick that
  // scrolls the list to its top stays a scroll. React's touch handlers are passive, so
  // these are native listeners that may preventDefault.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    let gesture: {
      startY: number;
      lastY: number;
      mayOwnDown: boolean;
      mayOwnUp: boolean;
      owned: boolean | null; // null until the first move picks a direction
      // the top card (phones) keeps Safari's pull away but doesn't resize the sheet
      resizes: boolean;
    } | null = null;
    const onStart = (e: TouchEvent) => {
      const target = e.target as Element;
      if (target.closest("[data-touch-exempt]")) {
        gesture = null; // the handle has its own swipe
        return;
      }
      const body = bodyRef.current;
      const inBody = body?.contains(target) ?? false;
      // the top card's suggestion list scrolls like the body: its own drags, except a pull
      // down from its top (kept from Safari's pull-to-refresh, T79)
      const list = headerRef.current?.contains(target)
        ? target.closest<HTMLElement>("[role=listbox]")
        : null;
      const y = e.touches[0].clientY;
      gesture = {
        startY: y,
        lastY: y,
        mayOwnDown: list
          ? list.scrollTop <= 0
          : !inBody || (body?.scrollTop ?? 0) <= 0,
        mayOwnUp: list ? false : !expandedRef.current,
        owned: null,
        resizes: !(headerRef.current?.contains(target) ?? false),
      };
    };
    const onMove = (e: TouchEvent) => {
      if (!gesture) return;
      gesture.lastY = e.touches[0].clientY;
      const dy = gesture.lastY - gesture.startY;
      if (gesture.owned === null && dy !== 0)
        gesture.owned = dy > 0 ? gesture.mayOwnDown : gesture.mayOwnUp;
      if (gesture.owned && e.cancelable) e.preventDefault();
    };
    const onEnd = () => {
      if (gesture?.owned && gesture.resizes) {
        const dy = gesture.lastY - gesture.startY;
        if (dy > DRAG_THRESHOLD_PX) setExpanded(false);
        else if (dy < -DRAG_THRESHOLD_PX) setExpanded(true);
      }
      gesture = null;
    };
    const onCancel = () => {
      gesture = null;
    };
    section.addEventListener("touchstart", onStart, { passive: true });
    section.addEventListener("touchmove", onMove, { passive: false });
    section.addEventListener("touchend", onEnd);
    section.addEventListener("touchcancel", onCancel);
    return () => {
      section.removeEventListener("touchstart", onStart);
      section.removeEventListener("touchmove", onMove);
      section.removeEventListener("touchend", onEnd);
      section.removeEventListener("touchcancel", onCancel);
    };
  }, []);

  function onHandlePointerUp(clientY: number) {
    const start = dragStartY.current;
    dragStartY.current = null;
    if (start === null) return;
    const dy = clientY - start;
    if (Math.abs(dy) <= DRAG_THRESHOLD_PX) return; // a tap: its click toggles
    setExpanded(dy < 0);
    swipedAt.current = performance.now();
  }

  function onHandleClick() {
    if (performance.now() - swipedAt.current < SWIPE_CLICK_MS) return;
    setExpanded((e) => !e); // tap or keyboard
  }

  return (
    <section
      ref={sectionRef}
      aria-label={label}
      // a place to hand focus without raising a phone's keyboard (the title screen)
      data-sheet
      tabIndex={-1}
      data-state={expanded ? "expanded" : "collapsed"}
      className={cn(
        "pixel-frame fixed inset-x-1 outline-none bottom-1 z-10 flex flex-col transition-[height] duration-200",
        // expanded: never up under the trip card on top (136 px), even on a short or
        // landscape phone (code review of v1.9)
        expanded ? "h-[min(80dvh,calc(100dvh-136px))]" : "h-[40dvh]",
        "md:absolute md:inset-x-auto md:bottom-auto md:top-4 md:left-4 md:h-auto md:max-h-[calc(100dvh-2.5rem)] md:w-96",
      )}
    >
      <button
        type="button"
        aria-label={expanded ? "Collapse directions" : "Expand directions"}
        aria-expanded={expanded}
        // the bar is thin to save the sheet's height; its hit area reaches up over the
        // map edge, so the target is 44 px tall (T75)
        data-touch-exempt
        className="relative flex touch-none justify-center py-2 before:absolute before:inset-x-0 before:-top-[22px] before:h-[22px] md:hidden"
        onPointerDown={(e) => {
          dragStartY.current = e.clientY;
          // keep getting the pointer when the finger leaves the thin handle
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerUp={(e) => onHandlePointerUp(e.clientY)}
        onPointerCancel={() => {
          dragStartY.current = null;
        }}
        onClick={onHandleClick}
      >
        <span className="h-1.5 w-10 rounded-full bg-muted-foreground/40" />
      </button>
      {header && (
        // phones: fixed to the top of the screen (the sheet has no transform, so `fixed`
        // is relative to the viewport); its suggestions drop over the map, so focusing it
        // doesn't grow the sheet (v1.9 rule 5). md: back in the side card's flow
        <div
          ref={headerRef}
          data-trip-header
          className="fixed inset-x-2 top-2 z-20 md:relative md:inset-auto md:top-auto md:px-4 md:pt-4 md:pb-3"
        >
          <div className="pixel-frame p-2 md:contents">{header}</div>
        </div>
      )}
      <div
        ref={bodyRef}
        data-sheet-body
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-4"
        // a search box down here (a trip stop) needs room for its suggestions. Only a box
        // you type in: a tapped checkbox or date field that grew the sheet moved out from
        // under the finger, and the tap was lost (v1.9)
        onFocusCapture={(e) => {
          const t = e.target;
          if (
            t instanceof HTMLInputElement &&
            (t.type === "search" || t.type === "text")
          )
            setExpanded(true);
        }}
      >
        {children}
      </div>
    </section>
  );
}
