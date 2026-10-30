import { useEffect, useState } from "react";

const EPOCH = new Date(0);

/**
 * The current time, refreshed every `everyMs` (null: not ticking). For countdowns.
 * Read only after mount: reading the clock while rendering is an unstable value to
 * Next.js (and would differ between the server and the browser).
 */
export function useNow(everyMs: number | null): Date {
  const [now, setNow] = useState(EPOCH);
  useEffect(() => {
    if (everyMs === null) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
