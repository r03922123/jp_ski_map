/**
 * Where the trip goes, as the planner shows it: lib/trip-places' shownTrip driven with a
 * trip and the loaded data, no React mount. Each row builds the trip the way the app does
 * (a link, then edits) and lists what the planner shows for it. MapShell.test.tsx holds
 * the same rules end to end.
 */
import { describe, expect, it } from "vitest";
import type { BusResult, RankedResort, Resort } from "@/lib/api";
import {
  emptyState,
  type PlaceInput,
  type SavedPlace,
} from "@/lib/saved-places";
import { shownTrip, type TripData } from "@/lib/trip-places";
import { parseViewState } from "@/lib/url-state";
import {
  editTrip,
  restoreTrip,
  type TripEvent,
  type TripState,
} from "@/lib/use-trip";
import busFixture from "../e2e/fixtures/bus-options-2026-03-20.json";

const gondola = { lat: 36.70179, lng: 137.83683 };
const happo = {
  id: "happo-one",
  name: { en: "Hakuba Happo-One Snow Resort", ja: "白馬八方尾根スキー場" },
  accessPoints: [{ id: "happo-one-adam-gondola", coord: gondola }],
} as Resort;
const goryuA = { lat: 36.66, lng: 137.85 };
const goryuB = { lat: 36.67, lng: 137.86 };
const goryu = {
  id: "goryu",
  name: { en: "Hakuba Goryu", ja: "白馬五竜" },
  accessPoints: [
    { id: "goryu-escal", coord: goryuA },
    { id: "goryu-iimori", coord: goryuB },
  ],
} as Resort;
const at = (
  resort: Resort,
  coord: { lat: number; lng: number },
): PlaceInput => ({
  id: resort.id,
  name: resort.name.en,
  coord,
  kind: "resort",
});
// Happo-One's first option in the fixture is Line H, boarded at the bus terminal; it drops
// you at Happo Nakiyama Slope
const [lineH] = (busFixture as BusResult).resorts
  .filter((r) => r.resortId === happo.id)
  .flatMap((r) => r.options);
const terminal = { lat: 36.7015349, lng: 137.8456096 };
const nakiyama = { lat: 36.69824, lng: 137.83881 };

const from = "36.69736,137.85393";
const fromPin: PlaceInput = {
  id: `pt:${from}`,
  name: "Dropped pin",
  coord: { lat: 36.69736, lng: 137.85393 },
  kind: "pin",
};
const point = { lat: 36.68, lng: 137.86 };
const chosenPlace: PlaceInput = {
  id: "pt:36.68000,137.86000",
  name: "Chosen place",
  coord: point,
  kind: "pin",
};
const saved = (place: PlaceInput): SavedPlace => ({
  ...place,
  lists: ["starred"],
  savedAt: "2026-11-26T00:00:00Z",
});
const onsen = saved({
  id: "onsen",
  name: "Onsen",
  coord: { lat: 36.7, lng: 137.85 },
  kind: "pin",
});
// a resort saved from search comes back from the link as a point at its coordinate
const savedHappo = saved({
  id: happo.id,
  name: happo.name.en,
  coord: { lat: 36.71, lng: 137.84 },
  kind: "resort",
});
const ranked = (resortId: string, accessPointId: string) =>
  ({ resortId, accessPointId }) as RankedResort;

const data: TripData = {
  resorts: { data: [happo, goryu], isLoading: false },
  ranking: { data: undefined, isPlaceholderData: false },
  savedState: { ...emptyState(), places: [onsen, savedHappo] },
  showNight: false,
};
const link = (search: string) =>
  restoreTrip(parseViewState(`?${search}`), undefined);
const edited = (trip: TripState, ...events: TripEvent[]) =>
  events.reduce(
    (t, event) =>
      editTrip(t, event, {
        resorts: data.resorts.data,
        savedPlaces: [],
        fromPlace: null,
        toPlace: null,
        placingStop: false,
      }).trip,
    trip,
  );
const busTapped: TripEvent = { type: "busTapped", bus: lineH };

type Row = {
  name: string;
  trip: TripState;
  data?: Partial<TripData>;
  shows: Partial<ReturnType<typeof shownTrip>>;
};

const table = (rows: Row[]) =>
  it.each(rows)("$name", (row) => {
    expect(shownTrip(row.trip, { ...data, ...row.data })).toMatchObject(
      row.shows,
    );
  });

describe("Walk's destination", () => {
  table([
    {
      name: "a resort with a start: its entrance is the route's end and the marker, and only its label stays",
      trip: link(`from=${from}&mode=walk&resort=happo-one`),
      shows: {
        selectedResortId: happo.id,
        routeMode: "walk",
        target: gondola,
        sharedTarget: gondola,
        destinationMarker: gondola,
        fromPlace: fromPin,
        toPlace: at(happo, gondola),
        showToBox: true,
        shownResortIds: [happo.id],
        hasDestination: true,
        canSwap: true,
        canAddStop: true,
        destinationKey: "happo-one||",
        routeKey: `walk|${from}|36.70179,137.83683|`,
      },
    },
    {
      name: "a resort with no start: the To place is set, every label stays and nothing is routed",
      trip: link("mode=walk&resort=happo-one"),
      shows: {
        target: gondola,
        fromPlace: null,
        toPlace: at(happo, gondola),
        shownResortIds: undefined,
        canSwap: false,
        canAddStop: false,
        routeKey: "",
      },
    },
    {
      name: "a two-entrance resort goes to the entrance this start's ranking found nearest",
      trip: link(`from=${from}&mode=walk&resort=goryu`),
      data: {
        ranking: {
          data: [ranked("goryu", "goryu-iimori")],
          isPlaceholderData: false,
        },
      },
      shows: {
        target: goryuB,
        sharedTarget: goryuB,
        toPlace: at(goryu, goryuB),
      },
    },
    {
      name: "a two-entrance resort waits for the ranking: the first entrance, and no tab time yet",
      trip: link(`from=${from}&mode=walk&resort=goryu`),
      shows: { target: goryuA, sharedTarget: null },
    },
    {
      name: "the previous start's ranking still picks the entrance, but gives no tab time",
      trip: link(`from=${from}&mode=walk&resort=goryu`),
      data: {
        ranking: {
          data: [ranked("goryu", "goryu-iimori")],
          isPlaceholderData: true,
        },
      },
      shows: { target: goryuB, sharedTarget: null },
    },
    {
      name: "a point is the end at once, named Chosen place, and leaves no resort label",
      trip: link(`from=${from}&mode=walk&dest=pt:36.68000,137.86000`),
      shows: {
        selectedResortId: null,
        target: point,
        sharedTarget: point,
        destinationMarker: point,
        toPlace: chosenPlace,
        shownResortIds: [],
        hasDestination: true,
        destinationKey: "null|36.68,137.86|",
      },
    },
    {
      name: "a point over a two-entrance resort still chosen is the end, with its tab time at once",
      trip: edited(link(`from=${from}&mode=walk&resort=goryu`), {
        type: "pointChosen",
        point: { coord: point, name: "Lawson" },
      }),
      shows: {
        selectedResortId: goryu.id,
        target: point,
        sharedTarget: point,
        toPlace: { ...chosenPlace, name: "Lawson" },
        shownResortIds: [],
      },
    },
    {
      name: "a point on a saved place is that place",
      trip: link(`from=${from}&mode=walk&dest=pt:36.70000,137.85000`),
      shows: { toPlace: onsen, shownResortIds: [] },
    },
    {
      name: "a point on a saved resort is still that resort: its label stays",
      trip: link(`from=${from}&mode=walk&dest=pt:36.71000,137.84000`),
      shows: {
        target: savedHappo.coord,
        toPlace: savedHappo,
        shownResortIds: [happo.id],
        onlyResortId: happo.id,
      },
    },
    {
      name: "neither a point nor a resort: no destination, one bar, every label",
      trip: link(`from=${from}&mode=walk`),
      shows: {
        target: undefined,
        destinationMarker: null,
        toPlace: null,
        showToBox: false,
        shownResortIds: undefined,
        hasDestination: false,
        canSwap: false,
        canAddStop: false,
        routeKey: "",
      },
    },
  ]);
});

describe("Bus's destination", () => {
  table([
    {
      name: "a resort and no bus yet: no route, no marker, every label, and the list narrows to it",
      trip: link(`from=${from}&mode=bus&resort=happo-one`),
      shows: {
        routeMode: "walk",
        target: null,
        destinationMarker: null,
        busChoice: null,
        busStop: null,
        toPlace: at(happo, gondola),
        shownResortIds: undefined,
        onlyResortId: happo.id,
        canAddStop: false,
        routeKey: "",
      },
    },
    {
      name: "a tapped bus: the walk to its stop, To where it drops you, its resort's label, and the list stays whole",
      trip: edited(link(`from=${from}&mode=bus`), busTapped),
      shows: {
        selectedResortId: happo.id,
        busChoice: lineH,
        busStop: terminal,
        target: terminal,
        destinationMarker: null,
        toPlace: at(happo, nakiyama),
        shownResortIds: [happo.id],
        onlyResortId: null,
        destinationKey: "happo-one||h1/1/stop-happo-bus-terminal",
        routeKey: `walk|${from}|36.7015349,137.8456096|`,
      },
    },
    {
      name: "Night bus keeps the tapped bus but draws no trip",
      trip: edited(link(`from=${from}&mode=bus`), busTapped),
      data: { showNight: true },
      shows: {
        busChoice: lineH,
        busStop: null,
        target: null,
        shownResortIds: undefined,
        routeKey: "",
      },
    },
    {
      name: "a place is the way back: it is marked, and a bus to a resort no longer counts",
      trip: edited(
        link(`from=${from}&mode=bus&dest=pt:36.68000,137.86000`),
        busTapped,
      ),
      shows: {
        selectedResortId: null,
        busPlace: chosenPlace,
        busChoice: null,
        busStop: null,
        destinationMarker: point,
        toPlace: chosenPlace,
        shownResortIds: [],
      },
    },
    {
      name: "a saved resort as the point is a resort, not a way back: To is the resort there",
      trip: link(`from=${from}&mode=bus&dest=pt:36.71000,137.84000`),
      shows: {
        busPlace: null,
        destinationMarker: null,
        toPlace: at(happo, savedHappo.coord),
        onlyResortId: happo.id,
      },
    },
    {
      name: "a resort the list doesn't know narrows nothing and has no To place",
      trip: link(`from=${from}&mode=bus&resort=no-such-resort`),
      shows: {
        onlyResortId: null,
        toPlace: null,
        canSwap: false,
        hasDestination: true,
      },
    },
  ]);
});

describe("the resort list on its way", () => {
  table([
    {
      name: "a linked resort waits for the list: no To place, and the place card holds back",
      trip: link(`from=${from}&mode=walk&resort=happo-one`),
      data: { resorts: { data: undefined, isLoading: true } },
      shows: { toPlace: null, destinationLoading: true },
    },
    {
      name: "a failed list leaves the place card usable",
      trip: link(`from=${from}&mode=walk&resort=happo-one`),
      data: { resorts: { data: undefined, isLoading: false } },
      shows: { toPlace: null, destinationLoading: false },
    },
    {
      name: "with no destination there is nothing to wait for",
      trip: link(`from=${from}&mode=walk`),
      data: { resorts: { data: undefined, isLoading: true } },
      shows: { toPlace: null, destinationLoading: false },
    },
  ]);
});

describe("the From place and the stops", () => {
  const station = {
    id: "jr-hakuba",
    kind: "place" as const,
    name: "JR Hakuba Station",
    nameJa: null,
    coord: { lat: 36.69877, lng: 137.86197 },
    detail: null,
    match: null,
    source: "test",
  };
  const withStop = link(
    `from=${from}&mode=walk&resort=happo-one&stops=36.70000,137.85000`,
  );
  table([
    {
      name: "a searched start is the place picked",
      trip: edited(link("mode=walk"), {
        type: "startSet",
        start: { by: "search", place: station },
      }),
      shows: {
        fromPlace: {
          id: station.id,
          name: station.name,
          coord: station.coord,
          // a search result that isn't a lodging or resort is saved as a pin
          kind: "pin",
        },
      },
    },
    {
      name: "a linked start on a saved place is that place",
      trip: link("from=36.70000,137.85000&mode=walk"),
      shows: { fromPlace: onsen },
    },
    {
      name: "a stop on a saved place takes its name; an open box waits for a tap and blocks another",
      trip: edited(withStop, { type: "stopAdded", place: null }),
      shows: {
        tripStops: [
          { key: "stop-url-0", place: onsen },
          { key: "stop-1", place: null },
        ],
        stopBoxOpen: true,
        canAddStop: false,
        routeKey: `walk|${from}|36.70179,137.83683|36.7,137.85`,
      },
    },
    {
      name: "an open box takes no taps without a start",
      // the box the planner offers needs a start; the trip itself can hold one without
      trip: edited(link("mode=walk&resort=happo-one"), {
        type: "stopAdded",
        place: null,
      }),
      shows: { stopBoxOpen: false },
    },
    {
      name: "Bus draws no stops",
      trip: edited(
        withStop,
        { type: "stopAdded", place: null },
        { type: "modeChanged", mode: "bus" },
      ),
      shows: { tripStops: [], stopBoxOpen: false, canAddStop: false },
    },
    {
      name: "five stops are the most",
      trip: link(
        `from=${from}&mode=walk&resort=happo-one&stops=${[1, 2, 3, 4, 5].map((i) => `36.6${i},137.8`).join(";")}`,
      ),
      shows: { canAddStop: false },
    },
  ]);
});
