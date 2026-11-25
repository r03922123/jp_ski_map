import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBusOptions, fetchBusToPlace } from "@/lib/api";

describe("fetchBusOptions", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch() {
    const fetchMock = vi.fn(
      async (_url: string) =>
        new Response(
          JSON.stringify({ status: "ok", nextServiceDate: null, resorts: [] }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("sends the chosen hotel's name so its own pickup stop counts as walk 0", async () => {
    const fetchMock = stubFetch();

    await fetchBusOptions(
      { lat: 36.7, lng: 137.84 },
      "2026-03-20T08:00",
      "Double Black Hotel",
    );

    const url = new URL(fetchMock.mock.calls[0][0], "http://x");
    expect(url.searchParams.get("name")).toBe("Double Black Hotel");
    expect(url.searchParams.get("at")).toBe("2026-03-20T08:00:00+09:00");
  });

  it("omits the name for a dropped pin", async () => {
    const fetchMock = stubFetch();

    await fetchBusOptions({ lat: 36.7, lng: 137.84 }, "2026-03-20T08:00", null);

    expect(
      new URL(fetchMock.mock.calls[0][0], "http://x").searchParams.has("name"),
    ).toBe(false);
  });

  it("asks the server for free shuttles only, so it filters before its cap", async () => {
    const fetchMock = stubFetch();
    const from = { lat: 36.7, lng: 137.84 };

    await fetchBusOptions(from, "2026-03-20T08:00", null);
    await fetchBusOptions(from, "2026-03-20T08:00", null, true);
    await fetchBusToPlace(from, from, "2026-03-20T08:00", null, null, true);

    const sent = fetchMock.mock.calls.map((c) =>
      new URL(c[0], "http://x").searchParams.get("freeOnly"),
    );
    expect(sent).toEqual([null, "true", "true"]);
  });
});
