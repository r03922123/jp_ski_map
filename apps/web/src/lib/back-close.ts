"use client";

import { useEffect, useRef } from "react";

/**
 * Back closes an open overlay instead of leaving the trip (T76).
 *
 * An open overlay owns one same-URL history entry. Back pops it and closes the
 * topmost overlay only; closing in the app (✕, Escape) takes the entry back, so no
 * stale Back step is left. The app's URL mirror writes through `mirrorUrl`, so a URL
 * that changed while an overlay was open is put back after the pop.
 */

type Entry = { close: () => void };

const stack: Entry[] = [];
let ownPops = 0; // pops we caused by taking an entry back
let latestSearch: string | null = null;
let listening = false;

function restoreLatest() {
  // the mirror writes no fragment, so a popped-to entry's #import= link is gone too
  if (
    latestSearch !== null &&
    (window.location.search !== latestSearch || window.location.hash !== "")
  ) {
    window.history.replaceState(window.history.state, "", latestSearch);
  }
}

function onPopState() {
  if (ownPops > 0) {
    ownPops--;
  } else {
    stack.pop()?.close();
  }
  restoreLatest();
}

/** The URL mirror: replace the current entry's query, and remember it. */
export function mirrorUrl(search: string) {
  latestSearch = search;
  window.history.replaceState(null, "", search);
}

export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  // StrictMode (dev) runs a mount's effect, its cleanup, then the effect again. The
  // cleanup's release waits a tick, and the second run keeps the same entry: a
  // history.back() racing a fresh pushState would skip two entries.
  const held = useRef<{ entry: Entry; release: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!listening) {
      window.addEventListener("popstate", onPopState);
      listening = true;
    }
    let entry: Entry;
    if (held.current) {
      window.clearTimeout(held.current.release);
      entry = held.current.entry;
      held.current = null;
    } else {
      entry = { close: () => closeRef.current() };
      window.history.pushState({ overlay: true }, "", window.location.href);
      stack.push(entry);
    }
    return () => {
      if (!stack.includes(entry)) return; // Back closed it: the entry is gone already
      const release = window.setTimeout(() => {
        held.current = null;
        const i = stack.indexOf(entry);
        if (i === -1) return;
        stack.splice(i, 1);
        ownPops++;
        window.history.back();
      }, 0);
      held.current = { entry, release };
    };
  }, [open]);
}
