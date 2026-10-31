import { describe, expect, it } from "vitest";
import { emptyRider, rename } from "@/lib/game/rider";
import {
  decodeRider,
  encodeRider,
  MAX_CODE,
  readRiderHash,
  riderShareUrl,
} from "@/lib/game/rider-share";
import { recordVisit } from "@/lib/game/stamps";
import { addTrip } from "@/lib/game/stats";
import { toBase64url } from "@/lib/saved-share";

function rider() {
  let s = rename(emptyRider(), "Yuki 雪");
  s = recordVisit(s, "happo-one", "2026-01-02").state;
  s = recordVisit(s, "happo-one", "2026-01-05").state;
  s = recordVisit(s, "cortina", "2026-01-03").state;
  return addTrip(s, { drive: 8.9, walk: 0.4 }, true);
}

describe("rider card links (SPEC-progression)", () => {
  it("round-trips name, stamps (first dates) and stats", () => {
    const decoded = decodeRider(encodeRider(rider()));
    expect(decoded).toEqual({
      ok: true,
      card: {
        name: "Yuki 雪",
        stamps: { "happo-one": "2026-01-02", cortina: "2026-01-03" },
        stats: { km: { bus: 0, drive: 8.9, walk: 0.4 }, trips: 1 },
      },
    });
  });

  it("never carries visit dates", () => {
    const json = atob(
      encodeRider(rider()).replaceAll("-", "+").replaceAll("_", "/"),
    );
    expect(json).not.toContain("2026-01-05");
  });

  it("lives in the URL fragment", () => {
    const url = riderShareUrl("https://x.test", "abc");
    expect(url).toBe("https://x.test/#rider=abc");
    expect(readRiderHash("#rider=abc")).toBe("abc");
    expect(readRiderHash("#import=abc")).toBeNull();
  });

  it("rejects damaged, tampered and oversized codes with a message", () => {
    expect(decodeRider("%%%")).toEqual({
      ok: false,
      error: expect.any(String),
    });
    const tampered = (o: unknown) =>
      decodeRider(toBase64url(JSON.stringify(o)));
    const good = {
      v: 1,
      n: "Yuki",
      s: [["happo-one", "2026-01-02"]],
      k: [0, 1, 2],
      t: 1,
    };
    expect(tampered(good).ok).toBe(true);
    expect(tampered({ ...good, v: 2 }).ok).toBe(false);
    expect(tampered({ ...good, n: "x".repeat(21) }).ok).toBe(false);
    expect(tampered({ ...good, s: [["<script>", "2026-01-02"]] }).ok).toBe(
      false,
    );
    expect(tampered({ ...good, s: [["happo-one", "soon"]] }).ok).toBe(false);
    expect(tampered({ ...good, k: [-1, 0, 0] }).ok).toBe(false);
    expect(tampered({ ...good, t: 1.5 }).ok).toBe(false);
    expect(decodeRider("A".repeat(MAX_CODE + 1))).toEqual({
      ok: false,
      error: expect.stringContaining("too long"),
    });
  });
});
