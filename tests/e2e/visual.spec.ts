import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect, test } from "./fixtures";

const visualProjects = new Set(["chromium-1440", "chromium-430", "chromium-320"]);

test.beforeEach(async ({ browserName }, testInfo) => {
  test.skip(
    browserName !== "chromium" || !visualProjects.has(testInfo.project.name),
    "Golden screenshots are intentionally limited to stable Chromium projects",
  );
});

async function expectStableScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  additionalMasks: Locator[] = [],
) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    animations: "disabled",
    mask: [
      page.locator("td:last-child"),
      page.locator(".order-row small"),
      page.locator(".notification-list small"),
      ...additionalMasks,
    ],
    maskColor: "#dce3de",
  });
  await testInfo.attach(`${name}-viewport`, {
    body: JSON.stringify(page.viewportSize()),
    contentType: "application/json",
  });
}

test("login visual baseline @visual @ui-smoke", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /sign in to salik/i })).toBeVisible();
  await expectStableScreenshot(page, testInfo, "login");
});

test("admin overview visual baseline @visual", async ({ loggedInAdmin }, testInfo) => {
  await expectStableScreenshot(loggedInAdmin, testInfo, "admin-overview");
});

test("supplier overview visual baseline @visual", async ({ loggedInSupplier }, testInfo) => {
  await expectStableScreenshot(loggedInSupplier, testInfo, "supplier-overview");
});

test("store overview visual baseline @visual", async ({ loggedInStore }, testInfo) => {
  const recentOrderIds = loggedInStore
    .locator(".panel")
    .filter({ has: loggedInStore.getByRole("heading", { name: "Recent orders" }) })
    .locator("tbody td:nth-child(2)");
  await recentOrderIds.evaluateAll((cells) => {
    cells.forEach((cell) => {
      cell.textContent = "ORDER-ID";
    });
  });
  await expectStableScreenshot(loggedInStore, testInfo, "store-overview", [recentOrderIds]);
});

test("driver route visual baseline @visual", async ({ loggedInDriver }, testInfo) => {
  await expectStableScreenshot(loggedInDriver, testInfo, "driver-route");
});
