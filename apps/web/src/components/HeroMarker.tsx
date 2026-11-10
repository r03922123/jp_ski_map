"use client";

import { useEffect, useState } from "react";
import { PixelSprite } from "@/components/PixelSprite";
import { HERO, type Pose } from "@/lib/game/sprites";
import type { BusPhase } from "@/lib/nav/bus-journey";

const FPS = 6; // SPEC-game-theme: 4–8 fps

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** The current frame of an `n`-frame loop; frame 0 forever with reduced motion. */
function useFrame(n: number): number {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    if (n < 2 || prefersReducedMotion()) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % n), 1000 / FPS);
    return () => clearInterval(id);
  }, [n]);
  return frame;
}

/** Which pose the rider takes, from the trip's state (SPEC-game-theme "The hero"). */
export function heroPose(trip: {
  mode: "drive" | "walk" | "bus";
  /** the navigator's phase; only "arrived" changes the pose */
  phase: string;
  bus?: BusPhase;
}): Pose {
  if (trip.mode === "bus" && trip.bus) {
    return { walk: "walk", wait: "idle", ride: "bus", arrived: "ride" }[
      trip.bus
    ] as Pose;
  }
  if (trip.phase === "arrived") return "ride";
  return trip.mode === "walk" ? "walk" : "drive";
}

/**
 * The sprite faces the way it travels *on screen*: heading relative to the map's own
 * rotation. It is mirrored, never rotated (a heading-up map always reads "right").
 */
export function facesLeft(
  headingDeg: number | null,
  mapBearingDeg: number,
): boolean {
  if (headingDeg === null) return false;
  const rel = (((headingDeg - mapBearingDeg) % 360) + 360) % 360;
  return rel > 180 && rel < 360;
}

export function Hero({
  pose,
  left = false,
  alt,
  scale = 2,
}: {
  pose: Pose;
  left?: boolean;
  alt: string;
  scale?: number;
}) {
  const sprite = HERO[pose];
  const frame = useFrame(sprite.frames.length) % sprite.frames.length;
  return (
    <PixelSprite
      id={`hero-${pose}`}
      sprite={sprite}
      frame={frame}
      mirrored={left}
      scale={scale}
      alt={alt}
      className="drop-shadow-[0_2px_0_rgb(34_34_58/0.35)]"
      data={{ "data-pose": pose, "data-frame": frame }}
    />
  );
}
