import { expect, test } from "@playwright/test";

// SPEC-web-app v1.6: the adventure's title screen and level select (v1.14: no HUD).

test.describe("the title screen", () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // a fresh browser session

  test("greets a bare visit once per session; Enter starts", async ({
    page,
  }) => {
    await page.goto("/");
    const title = page.getByRole("dialog", { name: "Hakuba Valley" });
    await expect(title).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^press start$/i }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(title).toHaveCount(0);
    await page.reload();
    await expect(page.locator("main")).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "Hakuba Valley" }),
    ).toHaveCount(0);
  });

  test("never stands in front of a shared link", async ({ page }) => {
    await page.goto("/?from=36.69711,137.85393&mode=drive");
    await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("dialog", { name: "Hakuba Valley" }),
    ).toHaveCount(0);
  });

  test("holds still with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(
      page.getByRole("dialog", { name: "Hakuba Valley" }),
    ).toBeVisible();
    await expect(page.locator(".title-flake").first()).toBeHidden();
  });
});

test.describe("level select", () => {
  test.use({
    permissions: ["geolocation"],
    geolocation: { latitude: 36.70179, longitude: 137.83683 }, // Happo-One's base
  });

  test("a level card shows a new stamp; worlds keep their numbers in any order", async ({
    page,
  }) => {
    await page.goto("/?from=36.69711,137.85393&mode=drive");
    const list = page.getByRole("list", { name: "Ranked resorts" });
    await expect(list).toBeVisible({ timeout: 15_000 });
    const happo = list
      .getByRole("listitem")
      .filter({ hasText: "Hakuba Happo-One" });
    await expect(happo.locator("[data-world]")).toHaveAttribute(
      "data-world",
      "5",
    );
    await expect(happo).toContainText("☆ not yet");

    await happo.getByText("Details").click();
    await happo.getByRole("button", { name: "Check in" }).click();
    await page
      .getByRole("button", { name: "OK", exact: true })
      .click({ timeout: 15_000 });
    await expect(happo).toContainText("★ stamped");

    // another sort: a different order, the same world numbers
    const worldsBefore = await list
      .locator("[data-world]")
      .evaluateAll((els) =>
        Object.fromEntries(
          els.map((e) => [
            e.closest("li")?.textContent?.slice(0, 30),
            e.getAttribute("data-world"),
          ]),
        ),
      );
    await page.getByLabel("Sort by").selectOption("vertical");
    await expect
      .poll(() =>
        list
          .locator("[data-world]")
          .evaluateAll((els) =>
            Object.fromEntries(
              els.map((e) => [
                e.closest("li")?.textContent?.slice(0, 30),
                e.getAttribute("data-world"),
              ]),
            ),
          ),
      )
      .toEqual(worldsBefore);
  });
});
