"use client";

import { type ReactNode, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const DRAG_THRESHOLD_PX = 30;

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
  const dragDeltaY = useRef(0);

  function onHandleClick() {
    const dy = dragDeltaY.current;
    dragDeltaY.current = 0;
    if (dy < -DRAG_THRESHOLD_PX) setExpanded(true);
    else if (dy > DRAG_THRESHOLD_PX) setExpanded(false);
    else setExpanded((e) => !e); // tap or keyboard
  }

  return (
    <section
      aria-label={label}
      data-state={expanded ? "expanded" : "collapsed"}
      className={cn(
        "pixel-frame fixed inset-x-1 bottom-1 z-10 flex flex-col transition-[height] duration-200",
        expanded ? "h-[80dvh]" : "h-[40dvh]",
        "md:absolute md:inset-x-auto md:bottom-auto md:top-4 md:left-4 md:h-auto md:max-h-[calc(100dvh-2.5rem)] md:w-96",
      )}
    >
      <button
        type="button"
        aria-label={expanded ? "Collapse directions" : "Expand directions"}
        aria-expanded={expanded}
        className="flex touch-none justify-center py-2 md:hidden"
        onPointerDown={(e) => {
          dragStartY.current = e.clientY;
        }}
        onPointerUp={(e) => {
          if (dragStartY.current !== null) {
            dragDeltaY.current = e.clientY - dragStartY.current;
          }
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
