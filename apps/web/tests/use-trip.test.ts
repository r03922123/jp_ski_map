/**
 * The trip's edit rules, driven through lib/use-trip's interface (a trip and an edit in, the
 * next trip and the panel it opens out) with no React mount. MapShell.test.tsx holds the
 * same rules end to end.
 */
import { describe, expect, it } from "vitest";
import type { BusResult, Resort, Suggestion } from "@/lib/api";
import type { PlaceInput, SavedPlace } from "@/lib/saved-places";
import { parseViewState } from "@/lib/url-state";
import {
  editTrip,
  restoreTrip,
  selectedResortOf,
  type TripEvent,
  type TripState,
  type TripWorld,
} from "@/lib/use-trip";
import busFixture from "../e2e/fixtures/bus-options-2026-03-20.json";

const gondola = { lat: 36.70179, lng: 137.83683 };
const happo = {
  id: "happo-one",
  name: { en: "Hakuba Happo-One Snow Resort", ja: "白馬八方尾根スキー場" },
  accessPoints: [{ id: "happo-one-adam-gondola", coord: gondola }],
} as Resort;
const happoPlace: PlaceInput = {
  id: happo.id,
  name: happo.name.en,
  coord: gondola,
  kind: "resort",
};
// Happo-One's first option in the fixture is Line H, a free bus; its third is Line V
const [freeBus, , paidBus] = (busFixture as BusResult).resorts
  .filter((r) => r.resortId === happo.id)
  .flatMap((r) => r.options);
const from = "36.69736,137.85393";
const fromCoord = { lat: 36.69736, lng: 137.85393 };
const linkPin: PlaceInput = {
  id: `pt:${from}`,
  name: "Dropped pin",
  coord: fromCoord,
  kind: "pin",
};
const station: Suggestion = {
  id: "jr-hakuba",
  kind: "place",
  name: "JR Hakuba Station",
  nameJa: null,
  coord: { lat: 36.69877, lng: 137.86197 },
  detail: null,
  match: null,
  source: "test",
};
const saved = (place: PlaceInput): SavedPlace => ({
  ...place,
  lists: ["starred"],
  savedAt: "2026-11-26T00:00:00Z",
});
const inn = saved({
  id: "osm-node-2",
  name: "Hotel Hakuba",
  coord: { lat: 36.68, lng: 137.86 },
  kind: "lodging",
});
const onsen = saved({
  id: "onsen",
  name: "Onsen",
  coord: { lat: 36.7, lng: 137.85 },
  kind: "pin",
});

const world: TripWorld = {
  resorts: [happo],
  savedPlaces: [onsen],
  fromPlace: null,
  toPlace: null,
  placingStop: false,
};
const send = (trip: TripState, event: TripEvent, w: Partial<TripWorld> = {}) =>
  editTrip(trip, event, { ...world, ...w });
const edit = (trip: TripState, event: TripEvent, w: Partial<TripWorld> = {}) =>
  send(trip, event, w).trip;
const link = (search: string) => restoreTrip(parseViewState(search), undefined);
const startAtPin = (trip: TripState, name: string | null) =>
  edit(trip, {
    type: "startSet",
    start: { by: "pin", pin: { coord: inn.coord, name } },
  });

describe("setting the start", () => {
  it("a search pick names the start and leaves the From box's text to the box", () => {
    const pinned = startAtPin(link(""), null);
    const trip = edit(pinned, {
      type: "startSet",
      start: { by: "search", place: station },
    });
    expect(trip).toMatchObject({
      origin: station.coord,
      originName: "JR Hakuba Station",
      originSource: {
        id: "jr-hakuba",
        name: "JR Hakuba Station",
        coord: station.coord,
        kind: "pin",
      },
      searchLabel: "Dropped pin",
      searchKey: pinned.searchKey,
    });
  });

  it("a saved place's Start from puts its name in the box; a saved pin has no name to match", () => {
    expect(
      edit(link(""), { type: "startSet", start: { by: "saved", place: inn } }),
    ).toMatchObject({
      origin: inn.coord,
      originName: "Hotel Hakuba",
      originSource: inn,
      searchLabel: "Hotel Hakuba",
      searchKey: 0,
    });
    expect(
      edit(link(""), {
        type: "startSet",
        start: { by: "saved", place: onsen },
      }),
    ).toMatchObject({ originName: null, searchLabel: "Onsen" });
  });

  it("a pin's Start here remounts the box with its name, or Dropped pin", () => {
    expect(startAtPin(link(""), null)).toMatchObject({
      origin: inn.coord,
      originName: null,
      originSource: null,
      searchLabel: "Dropped pin",
      searchKey: 1,
    });
    expect(startAtPin(link(""), "Hotel Hakuba")).toMatchObject({
      originName: "Hotel Hakuba",
      originSource: {
        id: "pt:36.68000,137.86000",
        name: "Hotel Hakuba",
        coord: inn.coord,
        kind: "pin",
      },
      searchLabel: "Hotel Hakuba",
      searchKey: 1,
    });
  });

  it("swap starts from the destination, remounting the box; a placeholder name is no name", () => {
    const chosen: PlaceInput = {
      id: "pt:36.68000,137.86000",
      name: "Chosen place",
      coord: inn.coord,
      kind: "pin",
    };
    const trip = edit(
      link(`?from=${from}&dest=pt:36.68000,137.86000`),
      { type: "swapped" },
      { fromPlace: linkPin, toPlace: chosen },
    );
    expect(trip).toMatchObject({
      origin: inn.coord,
      originName: null,
      originSource: chosen,
      searchLabel: "Chosen place",
      searchKey: 1,
    });
  });

  it("with no start in the link the trip starts from My hotel; a linked start wins", () => {
    expect(restoreTrip(parseViewState("?mode=walk"), inn)).toMatchObject({
      origin: inn.coord,
      originName: "Hotel Hakuba",
      originSource: inn,
      searchLabel: "My hotel · Hotel Hakuba",
    });
    expect(restoreTrip(parseViewState(`?from=${from}`), inn)).toMatchObject({
      origin: fromCoord,
      originName: null,
      originSource: null,
      searchLabel: null,
    });
  });
});

describe("clearing the start", () => {
  it("keeps a tapped bus's resort as the destination", () => {
    const tapped = edit(link(`?from=${from}&mode=bus`), {
      type: "busTapped",
      bus: freeBus,
    });
    expect(selectedResortOf(tapped)).toBe(happo.id);
    const cleared = edit(tapped, { type: "startCleared" });
    expect(cleared).toMatchObject({
      origin: null,
      originName: null,
      originSource: null,
      searchLabel: null,
      storedBusChoice: null,
    });
    expect(selectedResortOf(cleared)).toBe(happo.id);
  });

  it("keeps no bus resort over a point destination", () => {
    const tapped = edit(link(`?from=${from}&dest=pt:36.68000,137.86000`), {
      type: "busTapped",
      bus: freeBus,
    });
    const cleared = edit(tapped, { type: "startCleared" });
    expect(cleared.chosenResortId).toBeNull();
    expect(cleared.point?.coord).toEqual(inn.coord);
  });

  it("drops an open stop box and keeps the filled stops", () => {
    const trip = edit(link(`?from=${from}&stops=36.69000,137.84000`), {
      type: "stopAdded",
      place: null,
    });
    expect(trip.stops).toHaveLength(2);
    expect(edit(trip, { type: "startCleared" }).stops).toEqual([trip.stops[0]]);
  });
});

describe("the tapped bus", () => {
  const bus = link(`?from=${from}&mode=bus`);

  it("Free shuttles only drops a paid bus but keeps its resort, and keeps a free bus", () => {
    const paid = edit(edit(bus, { type: "busTapped", bus: paidBus }), {
      type: "paidBusesHidden",
    });
    expect(paid.storedBusChoice).toBeNull();
    expect(selectedResortOf(paid)).toBe(happo.id);
    const free = edit(bus, { type: "busTapped", bus: freeBus });
    expect(edit(free, { type: "paidBusesHidden" })).toBe(free);
  });

  it("choosing a resort keeps a bus to it and drops a bus to another", () => {
    const tapped = edit(bus, { type: "busTapped", bus: freeBus });
    expect(
      edit(tapped, { type: "resortChosen", id: happo.id }).storedBusChoice,
    ).toBe(freeBus);
    expect(
      edit(tapped, { type: "resortChosen", id: "goryu" }).storedBusChoice,
    ).toBeNull();
  });

  it("switching to Bus with a point destination drops it", () => {
    const tapped = edit(link(`?from=${from}&dest=pt:36.68000,137.86000`), {
      type: "busTapped",
      bus: freeBus,
    });
    expect(edit(tapped, { type: "modeChanged", mode: "walk" })).toMatchObject({
      storedBusChoice: freeBus,
    });
    expect(edit(tapped, { type: "modeChanged", mode: "bus" })).toMatchObject({
      mode: "bus",
      storedBusChoice: null,
    });
  });
});

describe("the destination", () => {
  const start = link(`?from=${from}&resort=happo-one`);

  it("the To box selects a known resort; any other place, or an unknown resort, is a point", () => {
    const point = edit(start, {
      type: "destinationChosen",
      place: station,
    });
    expect(point).toMatchObject({
      chosenResortId: null,
      point: { coord: station.coord, name: "JR Hakuba Station" },
    });
    const pick: TripEvent = {
      type: "destinationChosen",
      place: { ...happoPlace, kind: "resort" },
    };
    expect(edit(point, pick)).toMatchObject({
      chosenResortId: happo.id,
      point: null,
    });
    expect(edit(point, pick, { resorts: undefined })).toMatchObject({
      chosenResortId: null,
      point: { coord: gondola },
    });
  });

  it("Directions makes the start the destination and focuses a fresh, empty From box", () => {
    const trip = edit(start, { type: "directions" }, { fromPlace: linkPin });
    expect(trip).toMatchObject({
      origin: null,
      chosenResortId: null,
      point: { coord: fromCoord, name: "Dropped pin" },
      searchKey: 1,
      focusedSearchKey: 1,
    });
    expect(edit(start, { type: "directions" })).toBe(start);
  });
});

describe("swap", () => {
  it("makes the resort the start and the start a point; a second swap restores the resort", () => {
    const trip = edit(
      edit(link(`?from=${from}&resort=happo-one`), {
        type: "busTapped",
        bus: freeBus,
      }),
      { type: "swapped" },
      { fromPlace: linkPin, toPlace: happoPlace },
    );
    expect(trip).toMatchObject({
      origin: gondola,
      chosenResortId: null,
      point: { coord: fromCoord, name: "Dropped pin" },
      storedBusChoice: null,
    });
    const back = edit(
      trip,
      { type: "swapped" },
      { fromPlace: happoPlace, toPlace: linkPin },
    );
    expect(back).toMatchObject({
      origin: fromCoord,
      chosenResortId: happo.id,
      point: null,
    });
  });

  it("reverses the stops", () => {
    const trip = link(
      `?from=${from}&resort=happo-one&stops=36.69000,137.84000;36.69500,137.84500`,
    );
    const swapped = edit(
      trip,
      { type: "swapped" },
      { fromPlace: linkPin, toPlace: happoPlace },
    );
    expect(swapped.stops).toEqual([trip.stops[1], trip.stops[0]]);
  });

  it("does nothing without both ends", () => {
    const trip = link(`?from=${from}`);
    expect(edit(trip, { type: "swapped" }, { fromPlace: linkPin })).toBe(trip);
  });
});

describe("stops and map taps", () => {
  const trip = link(
    `?from=${from}&resort=happo-one&stops=36.69000,137.84000;36.69500,137.84500`,
  );
  const placing = edit(trip, { type: "stopAdded", place: null });
  const openStop = (t: TripState) => t.stops[t.stops.length - 1].place;

  it("a move swaps a stop with its neighbour; the ends stay put", () => {
    const [a, b] = trip.stops;
    expect(edit(trip, { type: "stopMoved", key: a.key, by: 1 }).stops).toEqual([
      b,
      a,
    ]);
    expect(edit(trip, { type: "stopMoved", key: a.key, by: -1 })).toBe(trip);
  });

  it("a map tap fills an open stop box only while it takes taps", () => {
    const coord = { lat: 36.691, lng: 137.841 };
    expect(
      openStop(
        edit(placing, { type: "mapTapped", coord }, { placingStop: true }),
      ),
    ).toEqual({
      id: "pt:36.69100,137.84100",
      name: "Dropped pin",
      coord,
      kind: "pin",
    });
    expect(edit(placing, { type: "mapTapped", coord })).toBe(placing);
  });

  it("a resort tap fills an open stop box, else picks the resort and opens its card", () => {
    const filled = send(
      placing,
      { type: "resortTapped", id: happo.id },
      { placingStop: true },
    );
    expect(openStop(filled.trip)).toEqual(happoPlace);
    expect(filled.opens).toBeUndefined();
    const picked = send(link(`?from=${from}`), {
      type: "resortTapped",
      id: happo.id,
    });
    expect(picked.trip.chosenResortId).toBe(happo.id);
    expect(picked.opens).toEqual({ panel: "resortCard", id: happo.id });
  });

  it("a saved tap fills an open stop box, else opens Saved on the place", () => {
    const filled = send(
      placing,
      { type: "savedTapped", id: onsen.id },
      { placingStop: true },
    );
    expect(openStop(filled.trip)).toBe(onsen);
    expect(filled.opens).toBeUndefined();
    const shown = send(placing, { type: "savedTapped", id: onsen.id });
    expect(shown.trip).toBe(placing);
    expect(shown.opens).toEqual({ panel: "saved", id: onsen.id });
  });
});

describe("restoring from the link", () => {
  it("restores the mode, start, resort, point and stops as pins", () => {
    expect(
      link(
        `?from=${from}&mode=bus&resort=happo-one&dest=pt:36.68000,137.86000&stops=36.69000,137.84000`,
      ),
    ).toMatchObject({
      mode: "bus",
      origin: fromCoord,
      chosenResortId: happo.id,
      point: { coord: inn.coord, name: null },
      stops: [
        {
          key: "stop-url-0",
          place: {
            id: "pt:36.69000,137.84000",
            name: "Dropped pin",
            coord: { lat: 36.69, lng: 137.84 },
            kind: "pin",
          },
        },
      ],
      storedBusChoice: null,
    });
  });
});
