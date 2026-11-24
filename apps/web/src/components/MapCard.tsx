"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

/**
 * The card for something picked on the map: a dropped pin, a run or a lift. Google slides
 * a sheet up over the directions for a dropped pin (docs/ux/behaviour-cards.md BC-A1):
 * title, a grey line saying what or where it is, then actions. On a phone it sits at the
 * bottom over the sheet; from `md` it sits on the map beside the side panel.
 */
export function MapCard({
  title,
  subtitle,
  onClose,
  children,
  focusOnOpen = false,
}: {
  title: string;
  subtitle: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  /** opened from a button in a card it replaced: focus would otherwise fall to the page */
  focusOnOpen?: boolean;
}) {
  const close = useRef<HTMLButtonElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the card opens
  useEffect(() => {
    if (focusOnOpen) close.current?.focus();
  }, []);
  useEffect(() => {
    // Escape dismisses it, like the app's other pop-ups
    const onKey = (e: KeyboardEvent) => {
      // an Escape a dialog above it already handled (its Save list picker) is not ours
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <fieldset className="surface fixed right-(--safe-right) bottom-0 left-(--safe-left) z-30 m-0 flex min-w-0 flex-col gap-2 rounded-t-[16px] border-0 px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] md:bottom-[calc(1rem+var(--safe-bottom))] md:right-[calc(1rem+var(--safe-right))] md:left-[calc(26rem+var(--safe-left))] md:max-w-96 md:rounded-[16px] md:pb-3">
      {/* float: a legend otherwise sits on the frame's border line. The legend names the
          card, so ✕ stays outside it */}
      <legend className="float-left pr-10 text-lg leading-tight font-semibold">
        {title}
      </legend>
      <button
        type="button"
        ref={close}
        aria-label="Close"
        onClick={onClose}
        className="absolute top-2.5 right-3 flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/70"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
      <div className="clear-left -mt-1 text-sm text-muted-foreground">
        {subtitle}
      </div>
      {children}
    </fieldset>
  );
}
