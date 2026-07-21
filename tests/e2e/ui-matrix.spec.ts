import type { Page } from "@playwright/test";
import { expect, expectPortal, test } from "./fixtures";

test.describe.configure({ timeout: 90_000 });

function observeBrowserHealth(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedResponses: string[] = [];

  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource:")
    ) {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    if (response.status() === 401 && url.pathname === "/api/auth/me") return;
    failedResponses.push(`${response.status()} ${url.pathname}`);
  });

  return () => {
    expect(consoleErrors, "unexpected browser console errors").toEqual([]);
    expect(pageErrors, "unexpected uncaught page errors").toEqual([]);
    expect(failedResponses, "unexpected failed network responses").toEqual([]);
  };
}

async function expectPageFitsViewport(page: Page) {
  const layout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ),
  }));
  expect(layout.pageWidth, "page-level horizontal overflow").toBeLessThanOrEqual(
    layout.viewportWidth + 1,
  );
}

async function expectInViewport(page: Page, locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  expect(box, "expected element to have a layout box").not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeLessThan(viewport!.height);
}

test("login fits every supported browser viewport @matrix @ui-smoke", async ({ page }) => {
  const assertHealthy = observeBrowserHealth(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /sign in to salik/i })).toBeVisible();
  await expectPageFitsViewport(page);
  await expectInViewport(page, page.getByRole("button", { name: /^sign in/i }));
  assertHealthy();
});

test("all role portals keep navigation and primary content usable @matrix @ui-smoke", async ({
  loggedInAdmin,
  loggedInSupplier,
  loggedInStore,
  loggedInDriver,
}) => {
  const portals = [
    [loggedInAdmin, "admin"],
    [loggedInSupplier, "supplier"],
    [loggedInStore, "store"],
    [loggedInDriver, "driver"],
  ] as const;

  for (const [page, portal] of portals) {
    const assertHealthy = observeBrowserHealth(page);
    await page.reload();
    await expectPortal(page, portal);
    await expectPageFitsViewport(page);
    await expect(page.getByRole("tab", { selected: true })).toBeVisible();
    await expectInViewport(page, page.getByRole("tab", { selected: true }));
    assertHealthy();
  }
});

test("store checkout and driver delivery actions remain reachable @matrix", async ({
  loggedInStore,
  loggedInDriver,
}) => {
  await loggedInStore.getByRole("tab", { name: /marketplace/i }).click();
  await loggedInStore.getByRole("button", { name: /add fresh milk/i }).click();
  await loggedInStore.getByRole("tab", { name: /cart/i }).click();
  const checkout = loggedInStore.getByRole("button", { name: /submit checkout/i });
  await checkout.scrollIntoViewIfNeeded();
  await expect(checkout).toBeVisible();
  await expectInViewport(loggedInStore, checkout);
  await expectPageFitsViewport(loggedInStore);

  const deliveryAction = loggedInDriver
    .getByRole("button", { name: /accept delivery|start delivery|mark delivered/i })
    .first();
  await deliveryAction.scrollIntoViewIfNeeded();
  await expect(deliveryAction).toBeVisible();
  await expectInViewport(loggedInDriver, deliveryAction);
  await expectPageFitsViewport(loggedInDriver);
});
