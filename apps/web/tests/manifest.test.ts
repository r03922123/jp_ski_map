import { describe, expect, it } from "vitest";
import { generateImageMetadata } from "@/app/icon";
import manifest from "@/app/manifest";

describe("web app manifest (SPEC-web-app v1.16)", () => {
  it("opens from the home screen as its own window", () => {
    const m = manifest();

    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
  });

  it("lists a 192 and a 512 PNG icon that the icon route serves", () => {
    const served = generateImageMetadata().map((i) => `/icon/${i.id}`);
    const icons = manifest().icons ?? [];

    for (const size of ["192x192", "512x512"]) {
      const icon = icons.find((i) => i.sizes === size);
      expect(icon?.type).toBe("image/png");
      expect(served).toContain(icon?.src);
    }
  });
});
