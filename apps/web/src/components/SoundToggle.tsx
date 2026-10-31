"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useSyncExternalStore } from "react";
import { sfx } from "@/lib/game/sfx";

const subscribe = (l: () => void) => sfx().subscribe(l);

/** Sound effects on/off (SPEC-game-theme): muted until the user turns it on. */
export function SoundToggle() {
  const muted = useSyncExternalStore(
    subscribe,
    () => sfx().muted(),
    () => true, // server: muted
  );
  return (
    <button
      type="button"
      aria-label="Sound effects"
      aria-pressed={!muted}
      title={muted ? "Sound off" : "Sound on"}
      className="flex size-8 items-center justify-center border-2 border-[var(--ink)] bg-card shadow-[2px_2px_0_var(--ink)] active:translate-y-0.5 active:shadow-none"
      onClick={() => sfx().setMuted(!muted)}
    >
      {muted ? (
        <VolumeX aria-hidden="true" className="size-4" />
      ) : (
        <Volume2 aria-hidden="true" className="size-4" />
      )}
    </button>
  );
}
