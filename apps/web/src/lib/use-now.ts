import { useEffect, useState } from "react";

/** The current time, refreshed every `everyMs` (null: frozen). For countdowns. */
export function useNow(everyMs: number | null): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (everyMs === null) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
