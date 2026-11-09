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
  };

  it("has no voice control", () => {
    const state = reduceBus(initialBus(), plan, fix(east(0)), DEPART - 360_000);
    render(
      <BusPilotView
        {...base}
        state={state}
        now={new Date(DEPART - 360_000)}
        onBoard={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /mute voice/i })).toBeNull();
  });

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

describe("bus journey edge cases from real data shapes", () => {
  it("a loop line (boards and gets off at the same stop) doesn't arrive at once", () => {
    const loop = {
      ...option,
      alightStopId: "s0",
      rideStops: [
        { stopId: "s0", name: "Iwatake", coord: east(0), time: "08:00" },
        { stopId: "s1", name: "A", coord: east(1000), time: "08:05" },
        { stopId: "s2", name: "B", coord: east(2000, 300), time: "08:15" },
        { stopId: "s0", name: "Iwatake", coord: east(0, 20), time: "08:25" },
      ],
    } as unknown as BusOption;
    const plan = planBus(loop, null);
    expect(plan.alightIndex).toBe(3);
    let s = boardManually(reduceBus(initialBus(), plan, fix(east(0)), DEPART));
    s = reduceBus(s, plan, fix(east(100)), DEPART + 30_000);
    expect(s.phase).toBe("ride");
  });

  it("a stop we can't place isn't marked passed before the bus gets there", () => {
    const gap = {
      ...option,
      rideStops: [
        { stopId: "s0", name: "Terminal", coord: east(0), time: "08:11" },
        { stopId: "sx", name: "Unplaced", coord: null, time: null },
        { stopId: "s2", name: "Plaza", coord: east(2000), time: "08:16" },
        { stopId: "s3", name: "Resort", coord: east(3000), time: "08:20" },
      ],
    } as unknown as BusOption;
    const plan = planBus(gap, null);
    let s = boardManually(reduceBus(initialBus(), plan, fix(east(0)), DEPART));
    expect(rideView(plan, s)).toMatchObject({ nextIndex: 1, stopsToGo: 3 });
    s = reduceBus(s, plan, fix(east(2100)), DEPART + 120_000);
    expect(rideView(plan, s)).toMatchObject({
      nextIndex: 3,
      stopsToGo: 1,
      getOffNext: true,
    });
  });
});

describe("BusPilotView with a long ride", async () => {
  const { render, screen } = await import("@testing-library/react");
  const { BusPilotView } = await import("@/components/BusPilotView");
  const { vi } = await import("vitest");
  // six stops 1 km apart on a straight line
  const six = {
    ...option,
    alightStopId: "s5",
    rideStops: Array.from({ length: 6 }, (_, i) => ({
      stopId: `s${i}`,
      name: `Stop ${i}`,
      coord: east(i * 1000),
      time: `08:${String(11 + i * 2).padStart(2, "0")}`,
    })),
  } as unknown as BusOption;
  const plan = planBus(six, null);
  const base = {
    plan,
    basis: "published" as const,
    onExit: vi.fn(),
    onBoard: vi.fn(),
  };
  const rows = () =>
    screen
      .getAllByRole("listitem")
      .filter((li) => li.closest('[aria-label="Bus stops"]'));

  it("waiting: all six stops, nothing passed or current", () => {
    const wait = reduceBus(initialBus(), plan, fix(east(0)), DEPART - 60_000);
    render(
      <BusPilotView {...base} state={wait} now={new Date(DEPART - 60_000)} />,
    );
    expect(rows()).toHaveLength(6);
    expect(rows().map((r) => r.dataset.state)).toEqual(
      Array(6).fill("upcoming"),
    );
    expect(screen.queryByText("(passed)")).toBeNull();
  });

  it("riding: every row's state, struck-through passed rows, highlighted next", () => {
    let ride = boardManually(
      reduceBus(initialBus(), plan, fix(east(0)), DEPART),
    );
    ride = reduceBus(ride, plan, fix(east(2500)), DEPART + 300_000);
    render(<BusPilotView {...base} state={ride} now={new Date(DEPART)} />);
    expect(rows().map((r) => r.dataset.state)).toEqual([
      "passed",
      "passed",
      "passed",
      "next",
      "upcoming",
      "upcoming",
    ]);
    for (const r of rows().slice(0, 3)) {
      expect(r).toHaveClass("line-through");
      expect(r).toHaveTextContent("(passed)");
    }
    expect(rows()[3]).toHaveAttribute("aria-current", "step");
    expect(rows()[3]).toHaveClass("bg-teal-50");
  });
});

describe("a phone that slept on the bus", () => {
  it("catches up when it wakes far along the line", () => {
    const long = {
      ...option,
      alightStopId: "s3",
      rideStops: [
        { stopId: "s0", name: "Start", coord: east(0), time: "08:00" },
        { stopId: "s1", name: "Near", coord: east(1000), time: "08:02" },
        { stopId: "s2", name: "Far", coord: east(12_000), time: "08:20" },
        { stopId: "s3", name: "End", coord: east(13_000), time: "08:22" },
      ],
    } as unknown as BusOption;
    const plan = planBus(long, null);
    let s = boardManually(reduceBus(initialBus(), plan, fix(east(0)), DEPART));
    s = reduceBus(s, plan, fix(east(11_000)), DEPART + 900_000); // 11 km on, one fix
    expect(rideView(plan, s).next.name).toBe("Far");
  });
});
