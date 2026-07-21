import { expectNoA11yViolations } from "./accessibility";
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "./fixtures";

test.describe.configure({ timeout: 120_000 });

async function expectAllTabsAccessible(page: Page, testInfo: TestInfo) {
  const tabs = page.getByRole("tab");
  const count = await tabs.count();
  for (let index = 0; index < count; index += 1) {
    const tab = tabs.nth(index);
    const label = (await tab.innerText()).trim();
    const name = label.toLowerCase().replace(/\s+/g, "-");
    await tab.click();
    await expect(page.getByRole("tabpanel", { name: label, exact: true })).toBeVisible();
    await expectNoA11yViolations(page, testInfo, `accessibility-${name}`);
  }
}

test("login has no blocking WCAG 2.2 A/AA violations @a11y @ui-smoke", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /sign in to salik/i })).toBeVisible();
  await expectNoA11yViolations(page, testInfo);
});

test("admin portal has no blocking WCAG violations @a11y", async ({
  loggedInAdmin,
}, testInfo) => {
  await expectAllTabsAccessible(loggedInAdmin, testInfo);
});

test("supplier portal has no blocking WCAG violations @a11y", async ({
  loggedInSupplier,
}, testInfo) => {
  await expectAllTabsAccessible(loggedInSupplier, testInfo);
});

test("store portal has no blocking WCAG violations @a11y", async ({
  loggedInStore,
}, testInfo) => {
  await expectAllTabsAccessible(loggedInStore, testInfo);
});

test("driver portal has no blocking WCAG violations @a11y", async ({
  loggedInDriver,
}, testInfo) => {
  await expectAllTabsAccessible(loggedInDriver, testInfo);
});

test("portal navigation exposes tab semantics and keyboard focus @a11y", async ({
  loggedInStore,
}) => {
  const navigation = loggedInStore.getByRole("tablist", { name: /store navigation/i });
  await expect(navigation).toBeVisible();
  const firstTab = navigation.getByRole("tab").first();
  await firstTab.focus();
  await expect(firstTab).toBeFocused();
  await expect(firstTab).toHaveCSS("outline-style", /^(?!none$).+/);
  await loggedInStore.keyboard.press("ArrowRight");
  const secondTab = navigation.getByRole("tab").nth(1);
  await expect(secondTab).toBeFocused();
  await expect(secondTab).toHaveAttribute("aria-selected", "true");
});

test("login errors are announced immediately @a11y", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/password/i).fill("not-the-demo-password");
  await page.getByRole("button", { name: /^sign in/i }).click();
  await expect(page.getByRole("alert")).toContainText(/invalid/i);
});

test("successful mutations expose a polite status message @a11y", async ({
  loggedInStore,
}) => {
  await loggedInStore.getByRole("tab", { name: /marketplace/i }).click();
  await loggedInStore.getByRole("button", { name: /add fresh milk/i }).click();
  await expect(loggedInStore.getByRole("status")).toContainText(/added/i);
});

test("resource failures are exposed as alerts @a11y", async ({ loggedInStore }) => {
  await loggedInStore.route("**/api/store/products", (route) => route.abort());
  await loggedInStore.getByRole("tab", { name: /marketplace/i }).click();
  await expect(loggedInStore.getByRole("alert")).toContainText(/failed/i);
});

test("form controls expose stable names for browser tooling @a11y", async ({
  page,
  loggedInAdmin,
  loggedInSupplier,
  loggedInStore,
}) => {
  await page.goto("/");
  await expect(page.getByLabel(/work email/i)).toHaveAttribute("name", "work-email");
  await expect(page.getByLabel(/^password$/i)).toHaveAttribute("name", "password");

  await loggedInAdmin.getByRole("tab", { name: /organizations/i }).click();
  await expect(
    loggedInAdmin.getByRole("combobox", { name: /^type$/i }),
  ).toHaveAttribute("name", "type");

  await loggedInSupplier.getByRole("tab", { name: /operations/i }).click();
  await expect(
    loggedInSupplier.getByRole("combobox", { name: /^address$/i }),
  ).toHaveAttribute("name", "address");

  await loggedInStore.getByRole("tab", { name: /recurring/i }).click();
  await expect(
    loggedInStore.getByRole("combobox", { name: /^product$/i }),
  ).toHaveAttribute("name", "product");
});
