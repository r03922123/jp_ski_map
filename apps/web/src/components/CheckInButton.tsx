"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchResorts } from "@/lib/api";
import { formatDistance } from "@/lib/format";
import { earnVisit } from "@/lib/game/stamp-moment";
import { checkIn } from "@/lib/game/stamps";
import { worldNumbers } from "@/lib/game/worlds";

type Status = "idle" | "locating" | string;

/**
 * Check in at a resort (SPEC-progression): one GPS reading, asked for by this tap and
 * never in the background. The reading is compared and dropped; only the day is kept.
 */
export function CheckInButton({ resortId }: { resortId: string }) {
  const resorts = useQuery({ queryKey: ["resorts"], queryFn: fetchResorts });
  const [status, setStatus] = useState<Status>("idle");
  const resort = resorts.data?.find((r) => r.id === resortId);
  if (!resort || !resorts.data) return null;
  const world = worldNumbers(resorts.data).get(resortId) ?? 0;

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setStatus("This device can't share its location");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const result = checkIn(resort, {
          coord: { lat: p.coords.latitude, lng: p.coords.longitude },
          accuracyM: p.coords.accuracy,
        });
        if (!result.ok) {
          setStatus(
            result.reason === "far"
              ? `You're ${formatDistance(result.distanceM)} from ${resort.name.en}'s base`
              : "Can't place you precisely: try again in the open",
          );
          return;
        }
        const { stamped, visited } = earnVisit(resort, world);
        setStatus(
          stamped
            ? "Stamp earned!"
            : visited
              ? "Visit logged for today"
              : "Already checked in today",
        );
      },
      (e) =>
        setStatus(
          e.code === e.PERMISSION_DENIED
            ? "Location is off for this site"
            : "Couldn't get your location",
        ),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={locate}
        disabled={status === "locating"}
        className="border-2 border-[var(--ink)] bg-card px-2 py-0.5 shadow-[2px_2px_0_var(--ink)] active:translate-y-0.5 active:shadow-none disabled:opacity-60"
      >
        Check in
      </button>
      <output className="text-muted-foreground">
        {status === "locating"
          ? "Finding you…"
          : status === "idle"
            ? ""
            : status}
      </output>
    </div>
  );
}
