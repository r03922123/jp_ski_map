import { describe, expect, it } from "vitest";
import {
  emptyState,
  findPlace,
  type PlaceInput,
  toggleInList,
} from "@/lib/saved-places";
import {
  decodeImport,
  encodeList,
  importList,
  MAX_IMPORT,
  readImportHash,
} from "@/lib/saved-share";

const onsen: PlaceInput = {
  id: "osm-node-7",
  name: "白馬八方温泉 みみずくの湯",
  coord: { lat: 36.69735, lng: 137.84402 },
  kind: "poi",
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
