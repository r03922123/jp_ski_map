import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  pilotAllowed,
  resetDeviceForTests,
  simulateRequested,
  usePilotAvailable,
} from "@/lib/device";

/** A controllable `(pointer: coarse)` media query (jsdom has no matchMedia). */
function fakePointer(coarse: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches: coarse,
    media: "(pointer: coarse)",
    // only "change" counts, so a misspelt event name in the hook fails these tests
    addEventListener: (type: string, cb: () => void) => {
      if (type === "change") listeners.add(cb);
    },
    removeEventListener: (type: string, cb: () => void) => {
      if (type === "change") listeners.delete(cb);
    },
  };
  vi.stubGlobal("matchMedia", (query: string) => {
    expect(query).toBe("(pointer: coarse)");
    return mq;
  });
  return {
    change(next: boolean) {
      mq.matches = next;
      for (const cb of listeners) cb();
    },
  };
}

beforeEach(() => {
  resetDeviceForTests();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("pilotAllowed", () => {
  it("allows touch-first devices and refuses fine pointers", () => {
    expect(pilotAllowed({ coarse: true, simulate: false, dev: false })).toBe(
      true,
    );
    expect(pilotAllowed({ coarse: false, simulate: false, dev: false })).toBe(
      false,
    );
  });

  it("lets ?simulate through on a laptop only in dev builds", () => {
    expect(pilotAllowed({ coarse: false, simulate: true, dev: true })).toBe(
      true,
    );
    expect(pilotAllowed({ coarse: false, simulate: true, dev: false })).toBe(
      false,
    );
  });
});

describe("simulateRequested", () => {
  it("remembers ?simulate even after the app rewrites the URL", () => {
    window.history.replaceState(null, "", "/?simulate&from=36.7,137.85");
    expect(simulateRequested()).toBe(true);
    window.history.replaceState(null, "", "/?from=36.7,137.85&mode=walk"); // the URL mirror drops it
    expect(simulateRequested()).toBe(true);
  });

  it("survives a reload of the tab, and ?simulate=0 turns it off", () => {
    window.history.replaceState(null, "", "/?simulate");
    expect(simulateRequested()).toBe(true);
    window.history.replaceState(null, "", "/?from=36.7,137.85"); // mirrored, then reloaded:
    resetDeviceForTests();
    expect(simulateRequested()).toBe(true);
    window.history.replaceState(null, "", "/?simulate=0");
    resetDeviceForTests();
    expect(simulateRequested()).toBe(false);
    window.history.replaceState(null, "", "/");
    resetDeviceForTests();
    expect(simulateRequested()).toBe(false);
  });
});

describe("usePilotAvailable", () => {
  it("is false on a laptop and true on a phone", () => {
    fakePointer(false);
    expect(renderHook(() => usePilotAvailable()).result.current).toBe(false);
    resetDeviceForTests();
    fakePointer(true);
    expect(renderHook(() => usePilotAvailable()).result.current).toBe(true);
  });

  it("follows a change of primary pointer (an iPad gets a trackpad keyboard)", () => {
    const pointer = fakePointer(true);
    const { result } = renderHook(() => usePilotAvailable());
    expect(result.current).toBe(true);
    act(() => pointer.change(false));
    expect(result.current).toBe(false);
    act(() => pointer.change(true)); // keyboard detached again
    expect(result.current).toBe(true);
  });

  it("treats a touchscreen laptop (fine primary pointer, touch points) as a laptop", () => {
    fakePointer(false);
    vi.stubGlobal("navigator", { ...navigator, maxTouchPoints: 10 });
    vi.stubGlobal("ontouchstart", null);
    expect(renderHook(() => usePilotAvailable()).result.current).toBe(false);
  });

  it("ignores ?simulate in a production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    window.history.replaceState(null, "", "/?simulate");
    fakePointer(false);
    expect(renderHook(() => usePilotAvailable()).result.current).toBe(false);
  });

  it("renders no Start on the server, even for a phone (no hydration mismatch)", () => {
    fakePointer(true);
    function Probe() {
      return <span>{String(usePilotAvailable())}</span>;
    }
    expect(renderToString(<Probe />)).toBe("<span>false</span>");
  });

  it("keeps Start on a laptop in dev with ?simulate", () => {
    window.history.replaceState(null, "", "/?simulate");
    fakePointer(false);
    expect(renderHook(() => usePilotAvailable()).result.current).toBe(true);
  });
});
