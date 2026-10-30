import { describe, expect, it } from "vitest";
import type { BusOption } from "@/lib/api";
import {
  boardManually,
  initialBus,
  planBus,
  reduceBus,
  rideView,
} from "@/lib/nav/bus-journey";
import type { Fix } from "@/lib/nav/project";

const LAT = 36.7;
const M_LNG = 111_320 * Math.cos((LAT * Math.PI) / 180);
const east = (m: number, north = 0) => ({
  lat: LAT + north / 110_540,
  lng: 137.85 + m / M_LNG,
});
const fix = (c: { lat: number; lng: number }): Fix => ({
  ...c,
  accuracyM: 5,
  speedMps: 8,
  headingDeg: 90,
  t: 0,
});

// a bus going east: board at 0 m, stops at 1 km and 2 km, get off at 3 km
const option = {
  routeName: "Line T",
  boardStopId: "s0",
  boardStopName: "Terminal",
  boardStopCoord: east(0),
  alightStopId: "s3",
  departsAt: "2027-01-15T08:11:00+09:00",
  arrivesAt: "2027-01-15T08:20:00+09:00",
  timed: true,
  rideStops: [
    { stopId: "s0", name: "Terminal", coord: east(0), time: "08:11" },
    { stopId: "s1", name: "Echo", coord: east(1000), time: "08:14" },
    { stopId: "s2", name: "Plaza", coord: east(2000), time: null },
    { stopId: "s3", name: "Resort", coord: east(3000), time: "08:20" },
  ],
} as unknown as BusOption;
const DEPART = Date.parse("2027-01-15T08:11:00+09:00");

describe("bus journey", () => {
  const plan = planBus(option, null); // no road path: straight lines between stops

  it("walk → wait on reaching the boarding stop", () => {
    let s = reduceBus(initialBus(), plan, fix(east(-200)), DEPART - 600_000);
    expect(s.phase).toBe("walk");
    s = reduceBus(s, plan, fix(east(-20)), DEPART - 300_000);
    expect(s.phase).toBe("wait");
  });

  it("wait → ride only once it's (nearly) time and you move along the line", () => {
    let s = reduceBus(initialBus(), plan, fix(east(0)), DEPART - 300_000);
    s = reduceBus(s, plan, fix(east(150)), DEPART - 300_000); // walking off early: not the bus
    expect(s.phase).toBe("wait");
    s = reduceBus(s, plan, fix(east(150)), DEPART + 30_000);
    expect(s.phase).toBe("ride");
  });

  it("'I'm on the bus' boards by hand", () => {
    const s = boardManually(
      reduceBus(initialBus(), plan, fix(east(0)), DEPART),
    );
    expect(s.phase).toBe("ride");
  });

  it("counts the stops down and says when to get off", () => {
    let s = boardManually(reduceBus(initialBus(), plan, fix(east(0)), DEPART));
    s = reduceBus(s, plan, fix(east(300)), DEPART + 60_000);
    expect(rideView(plan, s)).toMatchObject({
      next: { name: "Echo" },
      stopsToGo: 3,
      getOffNext: false,
    });
    s = reduceBus(s, plan, fix(east(2100)), DEPART + 300_000);
    expect(rideView(plan, s)).toMatchObject({
      next: { name: "Resort" },
      stopsToGo: 1,
      getOffNext: true,
    });
    s = reduceBus(s, plan, fix(east(2980)), DEPART + 500_000);
    expect(s.phase).toBe("arrived");
  });

  it("never goes backwards on a noisy fix", () => {
    let s = boardManually(reduceBus(initialBus(), plan, fix(east(0)), DEPART));
    s = reduceBus(s, plan, fix(east(2100)), DEPART);
    s = reduceBus(s, plan, fix(east(1500)), DEPART); // GPS jumped back
    expect(rideView(plan, s).next.name).toBe("Resort");
  });
});

describe("BusPilotView", async () => {
  const { render, screen, fireEvent } = await import("@testing-library/react");
  const { BusPilotView } = await import("@/components/BusPilotView");
  const { vi } = await import("vitest");
  const plan = planBus(option, null);
  const base = {
    plan,
    basis: "expected" as const,
    onExit: vi.fn(),
    muted: false,
    onToggleMute: vi.fn(),
  };

  it("waits with a countdown, an Expected label and a manual board button", () => {
    const onBoard = vi.fn();
    const state = reduceBus(initialBus(), plan, fix(east(0)), DEPART - 360_000);
    render(
      <BusPilotView
        {...base}
        state={state}
        now={new Date(DEPART - 360_000)}
        onBoard={onBoard}
      />,
    );
    expect(
      screen.getByRole("region", { name: "Bus journey" }),
    ).toHaveTextContent("Wait at Terminal");
    expect(
      screen.getByRole("region", { name: "Bus progress" }),
    ).toHaveTextContent("08:11 · in 6 min");
    expect(screen.getByText(/Expected times/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I'm on the bus" }));
    expect(onBoard).toHaveBeenCalled();
  });

  it("rides: upcoming stops with times (or none published), then 'get off next'", () => {
    let state = boardManually(initialBus());
    state = reduceBus(state, plan, fix(east(300)), DEPART);
    const { rerender } = render(
      <BusPilotView
        {...base}
        state={state}
        now={new Date(DEPART)}
        onBoard={vi.fn()}
      />,
    );
    const stops = screen.getByRole("list", { name: "Bus stops" });
    expect(stops).toHaveTextContent("Echo08:14");
    expect(stops).toHaveTextContent("Plazatime not published");
    state = reduceBus(state, plan, fix(east(2100)), DEPART);
    rerender(
      <BusPilotView
        {...base}
        state={state}
        now={new Date(DEPART)}
        onBoard={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("region", { name: "Bus journey" }),
    ).toHaveTextContent("Get off at Resort — next stop");
  });

  it("lists every stop while waiting, and marks passed and next while riding", () => {
    const wait = reduceBus(initialBus(), plan, fix(east(0)), DEPART - 60_000);
    const { rerender } = render(
      <BusPilotView
        {...base}
        state={wait}
        now={new Date(DEPART - 60_000)}
        onBoard={vi.fn()}
      />,
    );
    const names = () =>
      screen
        .getAllByRole("listitem")
        .filter((li) => li.closest('[aria-label="Bus stops"]'))
        .map((li) => li.querySelector("[data-stop-name]")?.textContent);
    expect(names()).toEqual(["Terminal", "Echo", "Plaza", "Resort"]);

    let ride = boardManually(wait);
    ride = reduceBus(ride, plan, fix(east(1500)), DEPART + 120_000); // past Echo
    rerender(
      <BusPilotView
        {...base}
        state={ride}
        now={new Date(DEPART)}
        onBoard={vi.fn()}
      />,
    );
    expect(names()).toEqual(["Terminal", "Echo", "Plaza", "Resort"]); // never cut short
    const row = (name: string) =>
      screen.getByText(name, { selector: "[data-stop-name]" }).closest("li");
    expect(row("Echo")).toHaveAttribute("data-state", "passed");
    expect(row("Echo")).toHaveTextContent("(passed)");
    expect(row("Plaza")).toHaveAttribute("aria-current", "step");
    expect(row("Resort")).toHaveAttribute("data-state", "upcoming");
  });
});
