/**
 * Chiptune sound effects synthesised with the Web Audio API: no audio files
 * (SPEC-game-theme "Sound"). Muted by default; the choice is kept in localStorage.
 * The AudioContext is made on the first unmuted user action (browsers' autoplay rules).
 * Sound is never the only signal: every effect has a visible counterpart.
 */

export type Effect =
  | "select"
  | "confirm"
  | "stamp"
  | "quest"
  | "bus"
  | "offRoute";
type Note = { hz: number; ms: number; wave: OscillatorType };

export const SOUND_KEY = "hakuba:sound";

const sq = (hz: number, ms: number): Note => ({ hz, ms, wave: "square" });
const tri = (hz: number, ms: number): Note => ({ hz, ms, wave: "triangle" });

export const EFFECTS: Record<Effect, Note[]> = {
  select: [sq(988, 45)],
  confirm: [sq(659, 70), sq(988, 110)],
  stamp: [sq(523, 90), sq(659, 90), sq(784, 90), sq(1047, 260)], // C E G C
  quest: [tri(784, 80), tri(988, 80), tri(1319, 200)],
  bus: [tri(392, 160), tri(330, 260)],
  offRoute: [sq(220, 140), sq(185, 220)],
};

const VOLUME = 0.08;

export type Sfx = {
  muted(): boolean;
  setMuted(muted: boolean): void;
  play(effect: Effect): void;
  subscribe(listener: () => void): () => void;
  /** for tests */
  context(): AudioContext | null;
};

export function createSfx({
  makeContext,
  storage,
}: {
  makeContext: () => AudioContext;
  storage: Storage | null;
}): Sfx {
  let muted = true;
  try {
    muted = storage?.getItem(SOUND_KEY) !== "on";
  } catch {
    // private mode: muted, as on any first visit
  }
  let ctx: AudioContext | null = null;
  const listeners = new Set<() => void>();

  function context(): AudioContext | null {
    if (!ctx) {
      try {
        ctx = makeContext();
      } catch {
        return null; // no Web Audio: stay silent
      }
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  }

  function play(effect: Effect) {
    if (muted) return;
    const ac = context();
    if (!ac) return;
    let t = ac.currentTime + 0.01;
    for (const note of EFFECTS[effect]) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = note.wave;
      osc.frequency.setValueAtTime(note.hz, t);
      const end = t + note.ms / 1000;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(VOLUME, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t);
      osc.stop(end);
      t = end;
    }
  }

  return {
    muted: () => muted,
    setMuted(next) {
      muted = next;
      try {
        storage?.setItem(SOUND_KEY, next ? "off" : "on");
      } catch {
        // kept for this visit only
      }
      for (const l of listeners) l();
      if (!next) play("select"); // this tap is the gesture that unlocks audio
    },
    play,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    context: () => ctx,
  };
}

let shared: Sfx | null = null;

/** The app's one sound board (browser only). */
export function sfx(): Sfx {
  if (!shared) {
    shared = createSfx({
      makeContext: () => new AudioContext(),
      storage: (() => {
        try {
          return window.localStorage;
        } catch {
          return null;
        }
      })(),
    });
  }
  return shared;
}
