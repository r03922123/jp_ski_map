import { expect, type Page, type Request, test } from "@playwright/test";

/**
 * Journey: BACK TO THE LODGING (SPEC-web-app v1.10). After skiing, one tap turns
 * "lodging → resort" into "resort → lodging". Needs the API and Valhalla running.
 */

test.describe.configure({ retries: 1, timeout: 60_000 });

const STATION = "36.69877,137.86197"; // JR Hakuba Station stands in for the lodging
const TRIP = `/?from=${STATION}&mode=drive&resort=happo-one`;
const SWAP = "Swap start and destination";

const DEVICES = [
  {
    name: "phone 393x852",
    use: {
      viewport: { width: 393, height: 852 },
      isMobile: true,
      hasTouch: true,
    },
  },
  { name: "laptop 1440x900", use: { viewport: { width: 1440, height: 900 } } },
];

const param = (page: Page, name: string) =>
  new URL(page.url()).searchParams.get(name);
const isRoutes = (r: Request) => /\/api\/routes\?/.test(r.url());
const coordOf = (r: Request, name: string) =>
  new URL(r.url()).searchParams.get(name);
const swapButton = (page: Page) => page.getByRole("button", { name: SWAP });
const routeReady = (page: Page) =>
  expect(page.getByText(/^ETA ~ \d+/)).toBeVisible({ timeout: 20_000 });

for (const device of DEVICES) {
  test.describe(device.name, () => {
    test.use(device.use);

    test("one tap routes from the resort back to the start", async ({
      page,
    }) => {
      await page.goto(TRIP);
      await routeReady(page);

      const reversed = page.waitForRequest(isRoutes);
      await swapButton(page).click();
      const request = await reversed;

      // the road network snaps nothing here: the old start is sent as it was
      expect(coordOf(request, "to")).toBe(STATION);
      expect(coordOf(request, "from")).not.toBe(STATION);
      await routeReady(page);

      await expect(page.getByRole("combobox", { name: "To" })).toHaveValue(
        "Dropped pin",
      );
      await expect(
        page.getByRole("combobox", { name: "Search hotel or place" }),
      ).toHaveValue(/Happo-One/);
      expect(param(page, "dest")).toBe(`pt:${STATION}`);
      expect(param(page, "resort")).toBeNull();
    });

    test("a second tap restores the resort as the destination", async ({
      page,
    }) => {
      await page.goto(TRIP);
      await routeReady(page);

      await swapButton(page).click();
      await expect.poll(() => param(page, "dest")).toBe(`pt:${STATION}`);
      await routeReady(page);
      await swapButton(page).click();

      await expect.poll(() => param(page, "resort")).toBe("happo-one");
      expect(param(page, "dest")).toBeNull();
      expect(param(page, "from")).toBe(STATION);
      await expect(page.getByRole("combobox", { name: "To" })).toHaveValue(
        /Happo-One/,
      );
    });

    test("stops are visited in the opposite order", async ({ page }) => {
      const near = "36.70000,137.86000";
      const far = "36.69000,137.85500";
      await page.goto(`${TRIP}&stops=${near};${far}`);
      await routeReady(page);

      const reversed = page.waitForRequest(/\/api\/route\/path/);
      await swapButton(page).click();
      const points: { lat: number; lng: number }[] = (
        await reversed
      ).postDataJSON().points;

      const middle = points
        .slice(1, -1)
        .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`);
      expect(middle).toEqual([far, near]);
    });

    test("bus: the button is disabled and says why", async ({ page }) => {
      await page.goto(`/?from=${STATION}&mode=bus`);
      await expect(swapButton(page)).toBeDisabled();
      await expect(swapButton(page)).toHaveAttribute(
        "title",
        "Switch to Drive or Walk",
      );
    });
  });
}
