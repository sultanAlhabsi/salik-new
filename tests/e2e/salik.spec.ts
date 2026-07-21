import { expect, test } from "./fixtures";

test("store can submit a multi-supplier checkout from desktop or mobile @mobile @smoke @ui-smoke", async ({
  loggedInStore,
}) => {
  const page = loggedInStore;
  await expect(
    page.getByRole("heading", { name: /store portal/i }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /marketplace/i }).click();
  await page.getByRole("button", { name: /add fresh milk/i }).click();
  await page.getByRole("button", { name: /add spring water/i }).click();
  await page.getByRole("tab", { name: /cart/i }).click();
  await page.getByRole("button", { name: /submit checkout/i }).click();
  await expect(page.getByText(/checkout submitted/i)).toBeVisible();
});

test("driver can complete an assigned delivery @ui-smoke", async ({ loggedInDriver }) => {
  const page = loggedInDriver;
  await expect(
    page.getByRole("heading", { name: /driver portal/i }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /accept delivery/i })
    .first()
    .click();
  await page
    .getByRole("button", { name: /start delivery/i })
    .first()
    .click();
  await page.getByLabel(/recipient name/i).fill("Maha Al Noor");
  await page.getByLabel(/proof note/i).fill("Received by store team");
  await page
    .getByRole("button", { name: /mark delivered/i })
    .first()
    .click();
  await expect(page.getByText(/delivery updated/i)).toBeVisible();
});
