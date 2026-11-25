import { describe, expect, it } from "vitest";
import {
  addList,
  emptyState,
  findPlace,
  MAX_LISTS,
  type PlaceInput,
  toggleInList,
} from "@/lib/saved-places";
import {
  decodeImport,
  encodeList,
  importList,
  importSummary,
  MAX_IMPORT,
  readImportHash,
} from "@/lib/saved-share";

const onsen: PlaceInput = {
  id: "osm-node-7",
  name: "白馬八方温泉 みみずくの湯",
  coord: { lat: 36.69735, lng: 137.84402 },
  kind: "pin",
};
const station: PlaceInput = {
  id: "stop-jr-hakuba",
  name: "JR Hakuba Station",
  coord: { lat: 36.69877, lng: 137.86197 },
  kind: "stop",
};

function base64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

describe("share links", () => {
  it("round-trips a list, including Japanese names", () => {
    let s = toggleInList(emptyState(), onsen, "want-to-go");
    s = toggleInList(s, station, "want-to-go");
    const code = encodeList(s, "want-to-go");
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/); // URL-safe, no padding

    const decoded = decodeImport(code);
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.list.name).toBe("Want to go");
    expect(decoded.list.places).toEqual([onsen, station]);
  });

  it("reads only #import= from the hash", () => {
    expect(readImportHash("#import=abc")).toBe("abc");
    expect(readImportHash("#other=abc")).toBeNull();
    expect(readImportHash("")).toBeNull();
  });

  it("keeps a restaurant or konbini shared before ADR-0010 as a pin", () => {
    const code = base64url(
      JSON.stringify({
        v: 1,
        n: "x",
        i: "flag",
        p: [
          ["osm-node-1", "Ramen", 36.7, 137.85, "poi"],
          ["stop-jr-hakuba", "JR Hakuba Station", 36.69877, 137.86197, "stop"],
        ],
      }),
    );
    const decoded = decodeImport(code);
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.list.places).toEqual([
      {
        id: "osm-node-1",
        name: "Ramen",
        coord: { lat: 36.7, lng: 137.85 },
        kind: "pin",
      },
      station,
    ]);
  });

  it("rejects garbage, bad coordinates and oversized lists", () => {
    expect(decodeImport("%%%").ok).toBe(false);
    const badCoord = base64url(
      JSON.stringify({
        v: 1,
        n: "x",
        i: "flag",
        p: [["a", "A", 999, 0, "pin"]],
      }),
    );
    expect(decodeImport(badCoord).ok).toBe(false);
    const tooMany = base64url(
      JSON.stringify({
        v: 1,
        n: "x",
        i: "flag",
        p: Array.from({ length: MAX_IMPORT + 1 }, (_, i) => [
          `p${i}`,
          "P",
          36.7,
          137.8,
          "pin",
        ]),
      }),
    );
    const result = decodeImport(tooMany);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/200/);
  });

  it("imports into an existing list of the same name, else a new one", () => {
    const code = encodeList(
      toggleInList(emptyState(), onsen, "want-to-go"),
      "want-to-go",
    );
    const decoded = decodeImport(code);
    if (!decoded.ok) throw new Error(decoded.error);

    const into = importList(emptyState(), decoded.list);
    expect(findPlace(into, onsen.id)?.lists).toEqual(["want-to-go"]);

    const renamed = importList(emptyState(), {
      ...decoded.list,
      name: "Onsen trip",
    });
    const created = renamed.lists.find((l) => l.name === "Onsen trip");
    expect(created?.builtIn).toBe(false);
    expect(findPlace(renamed, onsen.id)?.lists).toEqual([created?.id]);
  });
});

// review of #118: the message says what the import really did, not what the link held
describe("importSummary", () => {
  const list = {
    name: "Onsen trip",
    icon: "bookmark" as const,
    places: [onsen, station],
  };
  it("counts the places it added", () => {
    const before = emptyState();
    expect(importSummary(before, importList(before, list), list)).toBe(
      "Added 2 places to “Onsen trip”",
    );
  });
  it("says so when the list already had them (the same link opened twice)", () => {
    const once = importList(emptyState(), list);
    expect(importSummary(once, importList(once, list), list)).toBe(
      "“Onsen trip” already has these places",
    );
  });
  it("says nothing was added when no list can be made", () => {
    let full = emptyState();
    while (full.lists.length < MAX_LISTS) {
      const made = addList(full, `List ${full.lists.length}`, "star");
      if (!made) break;
      full = made.state;
    }
    expect(importSummary(full, importList(full, list), list)).toBe(
      `Couldn't add “Onsen trip”: Saved holds at most ${MAX_LISTS} lists`,
    );
  });
});
