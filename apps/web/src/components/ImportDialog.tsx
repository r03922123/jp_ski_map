"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import { savedStore } from "@/lib/saved-places";
import { decodeImport, importList } from "@/lib/saved-share";

const PREVIEW = 8;

/** Opened from a shared `#import=` link; nothing is stored until the user confirms. */
export function ImportDialog({
  code,
  onDone,
}: {
  code: string;
  /** Called with whether the places were added. */
  onDone: (imported: boolean) => void;
}) {
  const result = useMemo(() => decodeImport(code), [code]);
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 md:items-center">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[80dvh] w-full max-w-sm flex-col gap-3 overflow-y-auto rounded-t-2xl bg-background p-4 shadow-xl outline-none md:rounded-2xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone(false);
        }}
      >
        {result.ok ? (
          <>
            <h2 id={titleId} className="font-semibold">
              Add {result.list.places.length}{" "}
              {result.list.places.length === 1 ? "place" : "places"} to “
              {result.list.name}”?
            </h2>
            <ul className="flex flex-col gap-1 text-sm">
              {result.list.places.slice(0, PREVIEW).map((p) => (
                <li key={p.id} className="truncate">
                  · {p.name}
                </li>
              ))}
              {result.list.places.length > PREVIEW && (
                <li className="text-muted-foreground">
                  …and {result.list.places.length - PREVIEW} more
                </li>
              )}
            </ul>
            <p className="text-xs text-muted-foreground">
              Someone shared this list with you. It will be saved on this
              device.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-full border px-4 py-1.5 text-sm"
                onClick={() => onDone(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white"
                onClick={() => {
                  savedStore.update((s) => importList(s, result.list));
                  onDone(true);
                }}
              >
                Add to Saved
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id={titleId} className="font-semibold">
              Can't import this list
            </h2>
            <p role="alert" className="text-sm text-destructive">
              {result.error}
            </p>
            <button
              type="button"
              className="self-end rounded-full border px-4 py-1.5 text-sm"
              onClick={() => onDone(false)}
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
