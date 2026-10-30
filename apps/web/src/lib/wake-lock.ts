import { useEffect, useRef } from "react";

/**
 * Keep the screen on while `active` (Screen Wake Lock API). The browser drops the lock
 * whenever the page is hidden, so it is taken again when the page is shown.
 */
export function useWakeLock(active: boolean): { supported: boolean } {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;

  useEffect(() => {
    if (!active || !supported) return;
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (stopped) await lock.release();
        else sentinel = lock;
      } catch {
        // battery saver or no user gesture yet: the screen may dim, nothing else breaks
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active, supported]);

  return { supported };
}

/**
 * Call `onTimeout` once the page has stayed hidden for `ms` (e.g. the phone went into a
 * pocket and the trip was forgotten): GPS and the wake lock shouldn't run forever.
 */
export function useHiddenTimeout(
  active: boolean,
  ms: number,
  onTimeout: () => void,
): void {
  const latest = useRef(onTimeout);
  latest.current = onTimeout;
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(timer);
      if (document.visibilityState === "hidden") {
        timer = setTimeout(() => latest.current(), ms);
      }
    };
    document.addEventListener("visibilitychange", onChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onChange);
    };
  }, [active, ms]);
}
