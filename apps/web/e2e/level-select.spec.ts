import { expect, test } from "@playwright/test";

// SPEC-web-app v1.6: the resort ranking as level cards (world badge, stamp state).

test.describe("level select", () => {
  test.use({
    permissions: ["geolocation"],
    geolocation: { latitude: 36.70179, longitude: 137.83683 }, // Happo-One's base
  });

  test("a level card shows a new stamp; worlds keep their numbers in any order", async ({
    page,
  }) => {
    await page.goto("/?from=36.69711,137.85393&mode=walk");
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
    await page.getByLabel("Sort by").selectOption("terrain_size");
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
