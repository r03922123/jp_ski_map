"use client";

import { type ReactNode, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const DRAG_THRESHOLD_PX = 30;
const SWIPE_CLICK_MS = 400;

/** Bottom sheet on phones (collapsed / expanded), floating card from `md` up. */
export function BottomSheet({
  label,
  header,
  children,
}: {
  label: string;
  /** Rendered above the scroll area, so its dropdowns are not clipped by it. */
  header?: ReactNode;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const dragStartY = useRef<number | null>(null);
  // a mouse drag still sends a click afterwards; it must not undo the swipe. (A moving
  // touch on Android sends none, so the swipe acts on pointerup, not on click.)
  const swipedAt = useRef(Number.NEGATIVE_INFINITY);

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
      aria-label={label}
      // a place to hand focus without raising a phone's keyboard (the title screen)
      data-sheet
      tabIndex={-1}
      data-state={expanded ? "expanded" : "collapsed"}
      className={cn(
        "pixel-frame fixed inset-x-1 outline-none bottom-1 z-10 flex flex-col transition-[height] duration-200",
        expanded ? "h-[80dvh]" : "h-[40dvh]",
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
        <div
          className="relative z-20 px-4 pb-3 md:pt-4"
          // typing in the search box on a phone needs room for the suggestions
          onFocusCapture={() => setExpanded(true)}
        >
          {header}
        </div>
      )}
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
        // a search box down here (a trip stop) needs the room too
        onFocusCapture={(e) => {
          if (e.target instanceof HTMLInputElement) setExpanded(true);
        }}
      >
        {children}
      </div>
    </section>
  );
}
