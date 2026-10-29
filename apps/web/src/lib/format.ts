export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(Math.round(meters / 100) / 10).toFixed(1)} km`; // 1650 → 1.7, not 1.6
}

/** "HH:MM" in Hakuba time, `seconds` after `departAt`. */
export function formatArrival(departAt: Date, seconds: number): string {
  const minutes = Math.round(seconds / 60); // same rounding as formatDuration
  const arrive = new Date(departAt.getTime() + minutes * 60_000);
  return arrive.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}
