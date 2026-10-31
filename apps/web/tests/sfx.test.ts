import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSfx, EFFECTS, SOUND_KEY } from "@/lib/game/sfx";

class FakeContext {
  static made = 0;
  currentTime = 0;
  destination = {};
  state = "running";
  oscillators: {
    type: string;
    freqs: number[];
    started: number;
    stopped: number;
  }[] = [];
  constructor() {
    FakeContext.made++;
  }
  resume = vi.fn(async () => {});
  createOscillator() {
    const o = {
      type: "square",
      freqs: [] as number[],
      started: -1,
      stopped: -1,
      frequency: { setValueAtTime: (f: number) => o.freqs.push(f) },
      connect: () => {},
      start: (t: number) => {
        o.started = t;
      },
      stop: (t: number) => {
        o.stopped = t;
      },
    };
    this.oscillators.push(o);
    return o;
  }
  createGain() {
    return {
      gain: {
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => {},
    };
  }
}

const storage = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
} as Storage;

beforeEach(() => {
  FakeContext.made = 0;
  storage.clear();
});

const make = () =>
  createSfx({
    makeContext: () => new FakeContext() as unknown as AudioContext,
    storage: fakeStorage,
  });

describe("sfx (SPEC-game-theme Sound)", () => {
  it("is muted on first load and makes no AudioContext", () => {
    const sfx = make();
    expect(sfx.muted()).toBe(true);
    sfx.play("select");
    expect(FakeContext.made).toBe(0);
  });

  it("turning sound on (a user gesture) creates the context and plays select", () => {
    const sfx = make();
    sfx.setMuted(false);
    expect(FakeContext.made).toBe(1);
    expect((sfx.context() as unknown as FakeContext).oscillators.length).toBe(
      EFFECTS.select.length,
    );
  });

  it("plays each effect's notes in order, no audio files", () => {
    const sfx = make();
    sfx.setMuted(false);
    const ctx = sfx.context() as unknown as FakeContext;
    ctx.oscillators.length = 0;
    sfx.play("stamp");
    expect(ctx.oscillators.map((o) => o.freqs[0])).toEqual(
      EFFECTS.stamp.map((n) => n.hz),
    );
    const starts = ctx.oscillators.map((o) => o.started);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    expect(EFFECTS.stamp).toHaveLength(4); // a 4-note fanfare
  });

  it("remembers the choice", () => {
    make().setMuted(false);
    expect(storage.get(SOUND_KEY)).toBe("on");
    expect(make().muted()).toBe(false);
    make().setMuted(true);
    expect(make().muted()).toBe(true);
  });

  it("a remembered 'on' still waits for a gesture before making a context", () => {
    storage.set(SOUND_KEY, "on");
    const sfx = make();
    expect(FakeContext.made).toBe(0);
    sfx.play("select"); // plays are triggered by taps: the first one may create it
    expect(FakeContext.made).toBe(1);
  });

  it("survives storage that throws (private mode)", () => {
    const sfx = createSfx({
      makeContext: () => new FakeContext() as unknown as AudioContext,
      storage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
      } as unknown as Storage,
    });
    expect(sfx.muted()).toBe(true);
    expect(() => sfx.setMuted(false)).not.toThrow();
    expect(sfx.muted()).toBe(false);
  });

  it("has every effect the spec names", () => {
    expect(Object.keys(EFFECTS).sort()).toEqual([
      "bus",
      "confirm",
      "offRoute",
      "quest",
      "select",
      "stamp",
    ]);
  });
});
