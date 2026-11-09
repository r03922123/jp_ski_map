import { describe, expect, it } from "vitest";
import { busChoiceFor, stopMatchName } from "@/lib/nav/bus-place";

const toResort = { resortId: "hakuba47" };
const toPlace = { resortId: null };

describe("busChoiceFor", () => {
  it("keeps a shuttle chosen from the list on screen", () => {
    expect(busChoiceFor(toResort, false)).toBe(toResort);
    expect(busChoiceFor(toPlace, true)).toBe(toPlace);
  });

  it("drops a way-back shuttle once the resort list is showing", () => {
    expect(busChoiceFor(toPlace, false)).toBeNull();
  });

  it("drops a resort shuttle once a place's list is showing", () => {
    expect(busChoiceFor(toResort, true)).toBeNull();
  });

  it("has nothing to keep when nothing is chosen", () => {
    expect(busChoiceFor(null, true)).toBeNull();
  });
});

describe("stopMatchName", () => {
  it("keeps a real name, so a hotel's own stop still counts as walk 0", () => {
    expect(stopMatchName("Hakuba Tokyu Hotel")).toBe("Hakuba Tokyu Hotel");
  });

  it.each([
    "Dropped pin",
    "Chosen place",
    "",
    null,
    undefined,
  ])("treats %j as no name", (name) => {
    expect(stopMatchName(name)).toBeNull();
  });
});
