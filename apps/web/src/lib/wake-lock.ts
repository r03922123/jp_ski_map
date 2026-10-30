import { useEffect } from "react";

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
