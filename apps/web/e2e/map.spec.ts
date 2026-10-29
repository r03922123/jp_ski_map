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
