"use client";

import { useState } from "react";
import { ListPicker } from "@/components/ListPicker";
import { isSaved, type PlaceInput, useSaved } from "@/lib/saved-places";
import { cn } from "@/lib/utils";

/** Google's "Save": ☆ until the place is in any list (or is My hotel), then ★. */
export function SaveButton({
  place,
  className,
}: {
  place: PlaceInput;
  className?: string;
}) {
  const saved = isSaved(useSaved(), place.id);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={saved ? `Saved: ${place.name}` : `Save ${place.name}`}
        aria-pressed={saved}
        aria-haspopup="dialog"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-lg hover:bg-muted",
          saved ? "text-amber-500" : "text-muted-foreground",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        {saved ? "★" : "☆"}
      </button>
      {open && <ListPicker place={place} onClose={() => setOpen(false)} />}
    </>
  );
}
