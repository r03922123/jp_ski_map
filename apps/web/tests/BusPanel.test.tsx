import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  BusPanel,
  type BusPanelProps,
  rideStopRows,
} from "@/components/BusPanel";
import type { BusResult, Resort } from "@/lib/api";
import fixture from "../e2e/fixtures/bus-options-2026-03-20.json";

const resorts = [
  { id: "hakuba47", name: { en: "Hakuba47 Mountain Resort", ja: "" } },
  {
    id: "kashimayari",
    name: { en: "Kashimayari Ski Resort Family Park", ja: "" },
  },
] as unknown as Resort[];

function renderPanel(overrides: Partial<BusPanelProps> = {}) {
  const props: BusPanelProps = {
    resorts,
    result: { status: "success", data: fixture as BusResult },
    night: { status: "idle" },
    showNight: false,
    onShowNightChange: vi.fn(),
    departAt: "2026-03-20T08:00",
    onDepartAtChange: vi.fn(),
    selected: null,
    onSelect: vi.fn(),
    ...overrides,
  };
  render(<BusPanel {...props} />);
  return props;
}

describe("BusPanel", () => {
  it("lists each resort with its next departures", () => {
    renderPanel();

    const card = screen.getByRole("region", {
      name: "Hakuba47 Mountain Resort",
    });
    expect(within(card).getByText("08:11 → 08:39")).toBeInTheDocument();
    expect(
      within(card).getAllByText(/Hakuba Happo Bus Terminal/).length,
    ).toBeGreaterThan(0);
  });

  it("shows walk and wait for an option", () => {
    renderPanel();

    const card = screen.getByRole("region", {
      name: "Hakuba47 Mountain Resort",
    });
    expect(
      within(card).getAllByText(/walk <1 min · wait 11 min/).length,
    ).toBeGreaterThan(0);
  });

  it("selects an option", () => {
    const props = renderPanel();

    const card = screen.getByRole("region", {
      name: "Hakuba47 Mountain Resort",
    });
    fireEvent.click(within(card).getAllByRole("button")[0]);

    expect(props.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        resortId: "hakuba47",
        boardStopId: "stop-happo-bus-terminal",
      }),
    );
  });

  it("shows the journey timeline under the selected option", () => {
    const option = (fixture as BusResult).resorts.find(
      (r) => r.resortId === "hakuba47",
    )?.options[0];
    if (!option) throw new Error("fixture has no Hakuba47 option");
    renderPanel({ selected: option });

    const journey = screen.getByRole("list", { name: "Journey" });
    expect(journey).toHaveTextContent(/Board 08:11/);
    expect(journey).toHaveTextContent(/Line V · 3 stops · 28 min/);
    expect(journey).toHaveTextContent(/Arrive 08:39/);
  });

  it("lists every stop of the ride, in order, with its time", () => {
    const option = (fixture as BusResult).resorts.find(
      (r) => r.resortId === "hakuba47",
    )?.options[0];
    if (!option) throw new Error("fixture has no Hakuba47 option");
    renderPanel({ selected: option });

    const stops = within(
      screen.getByRole("list", { name: "Journey" }),
    ).getByRole("list", { name: "Bus stops" });
    const rows = within(stops).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      "Hakuba Happo Bus Terminal08:11",
      "Happo Nakiyama Slope08:16",
      "Echoland (Spicy)08:24",
      "Hakuba 47 Winter Sports Park08:39",
    ]);
  });

  it("always shows the source and the may-change notice", () => {
    renderPanel();

    expect(
      screen.getByRole("link", { name: /hakuba valley shuttle/i }),
    ).toHaveAttribute(
      "href",
      "https://www.hakubavalley.com/en/access_en/shuttlebus_en/",
    );
    expect(screen.getByText(/may change without notice/i)).toBeInTheDocument();
  });

  it("says when stop times are not published", () => {
    const untimed = structuredClone(fixture) as BusResult;
    const option = untimed.resorts[0].options[0];
    option.timed = false;
    option.arrivesAt = null;
    option.firstStopName = "Hotel Oak Forest";
    renderPanel({ result: { status: "success", data: untimed } });

    expect(
      screen.getAllByText(/stop times not published/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/departs Hotel Oak Forest/i).length,
    ).toBeGreaterThan(0);
  });

  it("explains out-of-season dates", () => {
    renderPanel({
      result: {
        status: "success",
        data: {
          status: "no_service",
          nextServiceDate: null,
          basis: "expected",
          newerSourcePending: false,
          resorts: [],
        },
      },
    });

    expect(
      screen.getByText(/no shuttle service on this date/i),
    ).toBeInTheDocument();
  });

  it("explains timetables that still await review", () => {
    renderPanel({
      result: {
        status: "success",
        data: {
          status: "awaiting_review",
          nextServiceDate: null,
          basis: "published",
          newerSourcePending: false,
          resorts: [],
        },
      },
    });

    expect(screen.getByText(/awaiting review/i)).toBeInTheDocument();
  });

  it("toggles the night bus", () => {
    const props = renderPanel();

    fireEvent.click(screen.getByLabelText(/night bus/i));

    expect(props.onShowNightChange).toHaveBeenCalledWith(true);
  });
});

describe("BusPanel season copy", () => {
  const base: BusResult = {
    status: "ok",
    nextServiceDate: null,
    basis: "published",
    basedOnSeason: "2025-26",
    newerSourcePending: false,
    resorts: (fixture as BusResult).resorts,
  };

  it("says published times are scheduled, without an Expected badge", () => {
    renderPanel({ result: { status: "success", data: base } });

    expect(screen.getByText(/scheduled times/i)).toBeInTheDocument();
    expect(screen.queryByText("Expected")).not.toBeInTheDocument();
  });

  it("labels projected times as Expected and explains why", () => {
    renderPanel({
      result: { status: "success", data: { ...base, basis: "expected" } },
    });

    expect(screen.getByText("Expected")).toBeInTheDocument();
    expect(
      screen.getByText(/based on last season's timetable/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/check before you go/i)).toBeInTheDocument();
  });

  it("folds a newer published timetable into the Expected notice", () => {
    renderPanel({
      result: {
        status: "success",
        data: { ...base, basis: "expected", newerSourcePending: true },
      },
    });

    expect(screen.getByText("Expected")).toBeInTheDocument();
    expect(screen.getByText(/newer timetable is out/i)).toBeInTheDocument();
    expect(screen.queryByText(/hasn't published/i)).not.toBeInTheDocument();
  });

  it("says when no departures are left today, not that there is no service", () => {
    renderPanel({
      result: {
        status: "success",
        data: { ...base, basis: "expected", resorts: [] },
      },
    });

    expect(
      screen.getByText(/no more departures after this time/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no shuttle service/i)).not.toBeInTheDocument();
    expect(screen.getByText("Expected")).toBeInTheDocument();
  });

  it("labels projected night departures too", () => {
    renderPanel({
      showNight: true,
      night: {
        status: "success",
        data: {
          basis: "expected",
          basedOnSeason: "2025-26",
          newerSourcePending: false,
          departures: [
            {
              routeId: "vn",
              boardStopId: "stop-happo-bus-terminal",
              boardStopName: "Hakuba Happo Bus Terminal",
              walkS: 120,
              departsAt: "2027-01-20T17:08:00+09:00",
              towards: "JR Hakuba Station",
            },
          ],
        },
      },
    });

    expect(screen.getByText("17:08")).toBeInTheDocument();
    expect(screen.getByText("Expected")).toBeInTheDocument();
  });

  it("names the next service day without a year", () => {
    renderPanel({
      result: {
        status: "success",
        data: {
          ...base,
          status: "no_service",
          nextServiceDate: "2026-12-13",
          resorts: [],
        },
      },
    });

    expect(screen.getByText(/next from Dec 13/)).toBeInTheDocument();
  });

  it.each([
    ["ok", base],
    ["expected", { ...base, basis: "expected" as const }],
    [
      "pending",
      { ...base, basis: "expected" as const, newerSourcePending: true },
    ],
    [
      "no_service",
      {
        ...base,
        status: "no_service" as const,
        nextServiceDate: "2026-12-13",
        resorts: [],
      },
    ],
    [
      "awaiting_review",
      { ...base, status: "awaiting_review" as const, resorts: [] },
    ],
  ])("never shows a four-digit year (%s)", (_name, data) => {
    renderPanel({ result: { status: "success", data } });

    expect(document.body.textContent).not.toMatch(/\b20\d\d\b/);
  });
});

describe("Journey stop list (long rides, loops)", () => {
  function renderOption(resortId: string) {
    const option = (fixture as BusResult).resorts.find(
      (r) => r.resortId === resortId,
    )?.options[0];
    if (!option) throw new Error(`fixture has no ${resortId} option`);
    render(
      <BusPanel
        resorts={[]}
        result={{ status: "success", data: fixture as BusResult }}
        night={{ status: "idle" }}
        showNight={false}
        onShowNightChange={vi.fn()}
        departAt="2026-03-20T08:00"
        onDepartAtChange={vi.fn()}
        selected={option}
        onSelect={vi.fn()}
      />,
    );
    return within(screen.getByRole("list", { name: "Journey" })).getByRole(
      "list",
      { name: "Bus stops" },
    );
  }

  it("lists all 8 stops of a long ride, in order, none marked passed", () => {
    const rows = within(renderOption("cortina")).getAllByRole("listitem");
    expect(rows).toHaveLength(8);
    expect(
      rows.map((r) => r.querySelector("[data-stop-name]")?.textContent),
    ).toEqual([
      "Hakuba Happo Bus Terminal",
      "JR Hakuba Station",
      "Hakuba Iwatake Snow Field",
      "Ochikura Jizo-mae",
      "Tsugaike Mountain Resort (Gondola)",
      "Hakuba Norikura Onsen Snow Resort",
      "Satomi",
      "Hakuba Cortina Snow Resort",
    ]);
    expect(rows[1]).toHaveTextContent("time not published");
    expect(rows.map((r) => r.dataset.state)).toEqual(Array(8).fill("upcoming"));
    expect(rows.some((r) => r.hasAttribute("aria-current"))).toBe(false);
    expect(rows.map((r) => r.dataset.role ?? "")).toEqual([
      "board",
      "",
      "",
      "",
      "",
      "",
      "",
      "alight",
    ]);
  });

  it("keeps every stop of a loop line that ends where it started", () => {
    const iwatake = {
      stopId: "stop-iwatake",
      name: "Iwatake",
      coord: null,
      time: "08:00",
    };
    const option = {
      alightStopId: "stop-iwatake",
      rideStops: [
        iwatake,
        { stopId: "a", name: "A", coord: null, time: "08:05" },
        { stopId: "b", name: "B", coord: null, time: "08:15" },
        { ...iwatake, time: "08:25" },
      ],
    } as unknown as Parameters<typeof rideStopRows>[0];
    expect(rideStopRows(option).map((r) => `${r.name} ${r.time}`)).toEqual([
      "Iwatake 08:00",
      "A 08:05",
      "B 08:15",
      "Iwatake 08:25",
    ]);
  });
});

describe("BusPanel date box (T78)", () => {
  it("offers today to a year ahead, and pulls a far-off typed date back in", () => {
    const props = renderPanel();
    const box = screen.getByLabelText("Leave after");
    const min = box.getAttribute("min") ?? "";
    const max = box.getAttribute("max") ?? "";
    expect(min).toMatch(/^\d{4}-\d{2}-\d{2}T00:00$/);
    expect(max > min).toBe(true);

    fireEvent.change(box, { target: { value: "9999-12-31T23:59" } });
    expect(props.onDepartAtChange).toHaveBeenLastCalledWith(max);
  });
});
