import { PrismaClient } from "@prisma/client";
import { expect, expectPortal, test } from "./fixtures";

test("loggedInAdmin opens the platform portal @mobile", async ({
  loggedInAdmin,
}) => {
  await expectPortal(loggedInAdmin, "admin");
});

test("loggedInSupplier opens the supply portal @mobile", async ({
  loggedInSupplier,
}) => {
  await expectPortal(loggedInSupplier, "supplier");
});

test("loggedInStore opens the store portal @mobile", async ({
  loggedInStore,
}) => {
  await expectPortal(loggedInStore, "store");
});

test("loggedInDriver opens the driver portal @mobile", async ({
  loggedInDriver,
}) => {
  await expectPortal(loggedInDriver, "driver");
});

test("role cookies are isolated and logout affects only one portal @ui-smoke", async ({
  loggedInAdmin,
  loggedInStore,
}) => {
  expect(loggedInAdmin.context()).not.toBe(loggedInStore.context());

  await loggedInAdmin.getByRole("button", { name: /sign out/i }).click();
  await expect(
    loggedInAdmin.getByRole("heading", { name: /sign in to salik/i }),
  ).toBeVisible();
  await loggedInStore.reload();
  await expectPortal(loggedInStore, "store");
});

test("an authenticated session survives navigation and reload @ui-smoke", async ({
  loggedInSupplier,
}) => {
  await loggedInSupplier.reload();
  await expectPortal(loggedInSupplier, "supplier");
});

test("portal fixture rejects a suspended account before opening a page", async ({
  portalFactory,
}) => {
  const prisma = new PrismaClient();
  try {
    await prisma.user.update({
      where: { email: "driver@fresh.om" },
      data: { status: "SUSPENDED" },
    });
  } finally {
    await prisma.$disconnect();
  }

  await expect(portalFactory("driver")).rejects.toThrow(/not active/i);
});

test("semantic portal assertion rejects the wrong portal", async ({
  loggedInAdmin,
}) => {
  await expect(expectPortal(loggedInAdmin, "store", { timeout: 100 })).rejects.toThrow();
});
