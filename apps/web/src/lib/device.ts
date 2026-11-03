import { useSyncExternalStore } from "react";

/**
 * Is this a device you'd navigate with? (SPEC-pilot "Devices")
 * Pilot mode is for touch-first devices (phones, tablets). A laptop's primary pointer is
 * fine (mouse/trackpad), it isn't carried while driving or walking, and its Wi-Fi-based
 * location is often hundreds of metres off. The user agent can't decide this: iPads
 * report a Mac user agent, so the primary pointer is the signal.
 */

const COARSE = "(pointer: coarse)";

export function pilotAllowed({
  coarse,
  simulate,
  dev,
}: {
  coarse: boolean;
  simulate: boolean;
  dev: boolean;
}): boolean {
  return coarse || (dev && simulate);
}

// `?simulate` is read once and kept for the tab: the app's URL mirror rewrites the query
// on load and drops parameters it doesn't know, so after that (and after a reload) the
// address bar no longer says it. `?simulate=0` turns it off again.
const SIMULATE_KEY = "hakuba:simulate";
let simulateFlag: boolean | null = null;

export function simulateRequested(): boolean {
  if (typeof window === "undefined") return false;
  if (simulateFlag === null) {
    const param = new URLSearchParams(window.location.search).get("simulate");
    let on = param !== null && param !== "0";
    try {
      if (param === null) on = sessionStorage.getItem(SIMULATE_KEY) === "1";
      else if (on) sessionStorage.setItem(SIMULATE_KEY, "1");
      else sessionStorage.removeItem(SIMULATE_KEY);
    } catch {
      // storage blocked: the flag lasts this page load only
    }
    simulateFlag = on;
  }
  return simulateFlag;
}

/** Tests only: forget the in-memory flag, as a page reload would. */
export function resetDeviceForTests(): void {
  simulateFlag = null;
}

const isDev = () => process.env.NODE_ENV !== "production";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(COARSE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return pilotAllowed({
    coarse: window.matchMedia(COARSE).matches,
    simulate: simulateRequested(),
    dev: isDev(),
  });
}

/** Whether to offer Start. False on the server and in the first paint (no hydration mismatch). */
export function usePilotAvailable(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

function getCoarse(): boolean {
  return window.matchMedia?.(COARSE).matches ?? false;
}

/**
 * A finger is the primary pointer (phones, tablets). Map hints follow it: on touch a tap
 * looks and a long-press drops a pin (docs/ux/behaviour-cards.md BC-A1). False on the
 * server and in the first paint (no hydration mismatch).
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia?.(COARSE);
      mq?.addEventListener?.("change", onChange);
      return () => mq?.removeEventListener?.("change", onChange);
    },
    getCoarse,
    () => false,
  );
}
