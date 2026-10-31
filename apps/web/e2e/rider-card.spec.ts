import { expect, test } from "@playwright/test";

// SPEC-progression v1.6: the rider card, its share link, and reset.
const HAPPO_BASE = { latitude: 36.70179, longitude: 137.83683 };
test.use({ permissions: ["geolocation"], geolocation: HAPPO_BASE });

test("stamp a world, rename, share a read-only card, then reset", async ({
  page,
  browser,
}) => {
  await page.goto("/?from=36.69711,137.85393&mode=drive");
  const card = page
    .getByRole("listitem")
    .filter({ hasText: "Hakuba Happo-One" });
  await card.getByText("Details").click();
  await card.getByRole("button", { name: "Check in" }).click();
  await page.getByRole("button", { name: "OK" }).click({ timeout: 15_000 });

  await page.getByRole("button", { name: "Rider card" }).click();
  const dialog = page.getByRole("dialog", { name: "Rider card" });
  await expect(dialog).toContainText("First Tracks · 1/10 stamps");
  await expect(
    dialog.getByRole("listitem", { name: /World 5, .*: stamped \d{4}-/ }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("listitem", { name: /World 1, .*: not yet/ }),
  ).toBeVisible();

  const name = dialog.getByLabel("Name");
  await name.fill("Yuki");
  await name.blur();
  await dialog.getByRole("button", { name: "Share card" }).click();
  const link = await dialog.getByLabel("Rider card link").inputValue();
  expect(link).toMatch(/\/#rider=/);

  // a friend opens it: view only, nothing to reset or rename
  const friend = await browser.newPage({ ignoreHTTPSErrors: true });
  await friend.goto(link);
  const shared = friend.getByRole("dialog", { name: "Yuki's rider card" });
  await expect(shared).toContainText("1/10 stamps");
  await expect(
    shared.getByRole("button", { name: "Reset progress" }),
  ).toHaveCount(0);
  await expect(shared.getByLabel("Name")).toHaveCount(0);
  expect(
    await friend.evaluate(() => localStorage.getItem("hakuba:rider")),
  ).not.toContain("happo-one");
  await friend.close();

  await dialog.getByRole("button", { name: "Reset progress" }).click();
  await dialog.getByRole("button", { name: "Erase" }).click();
  await expect(dialog).toContainText("Rookie · 0/10 stamps");
  await expect(name).toHaveValue("Yuki"); // the name stays
});
