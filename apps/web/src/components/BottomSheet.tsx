"use client";

import { type ReactNode, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const DRAG_THRESHOLD_PX = 30;

/** Bottom sheet on phones (collapsed / expanded), floating card from `md` up. */
export function BottomSheet({
  label,
  children,
}: {
  label: string;
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
        "fixed inset-x-0 bottom-0 z-10 flex flex-col rounded-t-2xl bg-background shadow-[0_-4px_16px_rgb(0_0_0/0.15)] transition-[height] duration-200",
        expanded ? "h-[80dvh]" : "h-[40dvh]",
        "md:absolute md:inset-x-auto md:bottom-auto md:top-3 md:left-3 md:h-auto md:max-h-[calc(100dvh-1.5rem)] md:w-96 md:rounded-xl md:shadow-lg",
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
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:pt-4">
        {children}
      </div>
    </section>
  );
}
