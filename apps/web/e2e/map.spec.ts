import { expect, test } from "@playwright/test";

test("renders a full-screen map of Hakuba with attribution", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");

  const canvas = page.locator("canvas.maplibregl-canvas");
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.width).toBe(viewport?.width);
  expect(box?.height).toBe(viewport?.height);

  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText(
    "OpenStreetMap",
  );

  // Tiles are decoded in web workers: a broken worker leaves a blank map with controls intact.
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});

test("zoomed in, hotel labels load their font: no 404s, clean console", async ({
  page,
}) => {
  const errors: string[] = [];
  const badFonts: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  const fontsLoaded: string[] = [];
  page.on("response", (res) => {
    if (!res.url().includes("/fonts/")) return;
    fontsLoaded.push(decodeURIComponent(res.url()));
    if (res.status() >= 400)
      badFonts.push(`${res.status()} ${decodeURIComponent(res.url())}`);
  });

  await page.goto("/");
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
  // fly to a hotel (zoom 14), then zoom in to where lodging names show (≥ 15)
  await page.getByRole("combobox", { name: /search/i }).fill("Hotel Hakuba");
  await page
    .getByRole("option", { name: /Hotel Hakuba/ })
    .first()
    .click({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(2500);

  // the labels really drew: lodging pins are on screen and Noto Sans was fetched
  await expect(page.locator("main")).not.toHaveAttribute(
    "data-lodging-pins",
    "0",
  );
  expect(fontsLoaded.some((u) => u.includes("Noto Sans Regular"))).toBe(true);
  expect(badFonts).toEqual([]);
  expect(errors).toEqual([]);
});

test("an attribute a browser adds to <html> (Chrome on iOS) causes no hydration error", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text().slice(0, 200));
  });
  // what Chrome on iOS does: tag the root element before React hydrates
  await page.addInitScript(() => {
    const tag = () =>
      document.documentElement?.setAttribute("__gcrremoteframetoken", "test");
    new MutationObserver(tag).observe(document, {
      childList: true,
      subtree: true,
    });
    tag();
  });
  await page.goto("/");
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
  await expect(page.locator("html")).toHaveAttribute(
    "__gcrremoteframetoken",
    "test",
  );
  expect(errors.filter((e) => /hydrat/i.test(e))).toEqual([]);
});

// T73: a double-click zooms; it must not also move the start (the hotel is lost)
test("double-click zooms without moving the start; a single click still moves it", async ({
  page,
}) => {
  await page.goto("/?from=36.6985,137.8376");
  const main = page.locator("main[data-map-loaded='true']");
  await expect(main).toBeAttached({ timeout: 15_000 });
  await expect(page.getByRole("img", { name: "Starting point" })).toBeVisible();
  const startBefore = new URL(page.url()).searchParams.get("from");

  const canvas = page.locator("canvas.maplibregl-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("map canvas has no size");
  const zoomBefore = await page.evaluate(() =>
    (
      window as unknown as { __hakubaMap: { getZoom(): number } }
    ).__hakubaMap.getZoom(),
  );
  await page.mouse.dblclick(
    box.x + box.width / 2 + 60,
    box.y + box.height / 2 + 60,
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __hakubaMap: { getZoom(): number } }
        ).__hakubaMap.getZoom(),
      ),
    )
    .toBeGreaterThan(zoomBefore + 0.5);
  // past any single-click delay: the start is where the URL put it
  await page.waitForTimeout(600);
  expect(new URL(page.url()).searchParams.get("from")).toBe(startBefore);

  await page.mouse.click(
    box.x + box.width / 2 + 60,
    box.y + box.height / 2 + 60,
  );
  await expect
    .poll(() => new URL(page.url()).searchParams.get("from"))
    .not.toBe(startBefore);
});
