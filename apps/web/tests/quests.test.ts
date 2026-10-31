import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Resort } from "@/lib/api";
import {
  completeKonbini,
  completeVisitQuests,
  isKonbini,
  MAX_QUESTS,
  POWDER_CM,
  questOf,
  questsFor,
  syncQuests,
  todaysQuests,
} from "@/lib/game/quests";
import { emptyRider, type RiderState } from "@/lib/game/rider";
import { recordVisit } from "@/lib/game/stamps";
import { addTrip, coveredKm } from "@/lib/game/stats";

const resorts = JSON.parse(
  readFileSync("../../data/resorts.json", "utf8"),
) as Resort[];
const D = "2026-01-02";
const snow = [
  { resortId: "happo-one", cm: 12 },
  { resortId: "cortina", cm: 25 },
  { resortId: "jigatake", cm: 3 },
];

describe("questsFor (SPEC-progression)", () => {
  it("is deterministic and offers at most 3", () => {
    const a = questsFor(D, emptyRider(), resorts, snow);
    expect(questsFor(D, emptyRider(), resorts, snow)).toEqual(a);
    expect(a.length).toBeLessThanOrEqual(MAX_QUESTS);
  });

  it(`powder day: the biggest fresh snow ≥ ${POWDER_CM} cm`, () => {
    const q = questsFor(D, emptyRider(), resorts, snow).find(
      (x) => x.kind === "powder",
    );
    expect(q).toMatchObject({ kind: "powder", resortId: "cortina", cm: 25 });
    const thin = questsFor(D, emptyRider(), resorts, [
      { resortId: "cortina", cm: 9.9 },
    ]);
    expect(thin.some((x) => x.kind === "powder")).toBe(false);
  });

  it("no snow data, no powder quest (never a made-up number)", () => {
    expect(
      questsFor(D, emptyRider(), resorts, null).some(
        (x) => x.kind === "powder",
      ),
    ).toBe(false);
  });

  it("new world: the nearest unstamped resort by drive time, else the lowest world", () => {
    const byWorld = questsFor(D, emptyRider(), resorts, null).find(
      (x) => x.kind === "explore",
    );
    expect(byWorld?.resortId).toBe("cortina"); // W1
    const near = questsFor(D, emptyRider(), resorts, null, [
      "happo-one",
      "hakuba47",
    ]);
    expect(near.find((x) => x.kind === "explore")?.resortId).toBe("happo-one");
    let all: RiderState = emptyRider();
    for (const r of resorts) all = recordVisit(all, r.id, "2025-12-01").state;
    expect(
      questsFor(D, all, resorts, null).some((x) => x.kind === "explore"),
    ).toBe(false);
  });

  it("the quest's details round-trip through its id", () => {
    for (const q of questsFor(D, emptyRider(), resorts, snow))
      expect(questOf(q.id)).toEqual(q);
  });
});

describe("a day's quests", () => {
  const gen = questsFor(D, emptyRider(), resorts, snow);

  it("freeze once made: a stamp doesn't swap today's explore quest for another", () => {
    const s1 = syncQuests(emptyRider(), D, gen);
    const visited = completeVisitQuests(recordVisit(s1, "cortina", D).state, D);
    const regenerated = questsFor(D, visited, resorts, snow);
    const s2 = syncQuests(visited, D, regenerated);
    expect(todaysQuests(s2, D).map((q) => q.id)).toEqual(gen.map((q) => q.id));
  });

  it("a visit completes powder and explore quests for that resort that day", () => {
    const s = syncQuests(emptyRider(), D, gen);
    const done = completeVisitQuests(recordVisit(s, "cortina", D).state, D);
    const states = Object.fromEntries(
      done.quests.map((q) => [questOf(q.id).kind, q.status]),
    );
    expect(states).toEqual({
      powder: "done",
      explore: "done",
      konbini: "active",
    });
  });

  it("expire at midnight JST: yesterday's active quests go, done ones stay in the log", () => {
    let s = syncQuests(emptyRider(), D, gen);
    s = completeKonbini(s, D);
    s = syncQuests(s, "2026-01-03", questsFor("2026-01-03", s, resorts, null));
    expect(s.quests.filter((q) => q.date === D).map((q) => q.status)).toEqual([
      "done",
    ]);
  });

  it("konbini stops are recognised by name (EN and JA chains)", () => {
    for (const n of [
      "7-Eleven Happo",
      "Lawson Hakuba",
      "FamilyMart",
      "ローソン白馬",
      "セブン-イレブン",
      "ファミリーマート",
    ])
      expect(isKonbini(n), n).toBe(true);
    expect(isKonbini("Hakuba Happo Bus Terminal")).toBe(false);
  });
});

describe("stats: pilot trips only", () => {
  it("adds km by mode and counts arrived trips", () => {
    let s = addTrip(emptyRider(), { drive: 8.9 }, true);
    s = addTrip(s, { walk: 0.4, bus: 6.2 }, true);
    s = addTrip(s, { walk: 1.1 }, false); // stopped early: distance, no trip
    expect(s.stats).toEqual({
      km: { bus: 6.2, drive: 8.9, walk: 1.5 },
      trips: 2,
    });
  });

  it("coveredKm is the distance along the route, never more than the route", () => {
    expect(coveredKm(1250, 3000)).toBe(1.25);
    expect(coveredKm(3500, 3000)).toBe(3);
    expect(coveredKm(-5, 3000)).toBe(0);
  });
});
