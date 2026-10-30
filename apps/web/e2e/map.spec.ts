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
  page.on("response", (res) => {
    if (res.url().includes("/fonts/") && res.status() >= 400)
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

  expect(badFonts).toEqual([]);
  expect(errors).toEqual([]);
});
