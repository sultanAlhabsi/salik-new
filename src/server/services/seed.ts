import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { persistDemoDataset } from "./demo-dataset.js";
import { demoFixtureIds, demoFixtures, demoPassword } from "./demo-fixtures.js";

export function assertDemoSeedAllowed(
  environment: NodeJS.ProcessEnv,
  databaseUrl: string,
) {
  if (environment.NODE_ENV === "production") {
    throw new Error("Demo seed is disabled in production");
  }
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Demo seed requires a local PostgreSQL host");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
  ) {
    throw new Error("Demo seed requires a local PostgreSQL host");
  }
}

export async function seedDatabase(prisma: PrismaClient) {
  await clearDatabase(prisma);
  await persistDemoDataset(prisma);

  const superAdmin = await prisma.user.create({
    data: {
      email: "admin@salik.om",
      name: "Aisha Platform Admin",
      passwordHash: await bcrypt.hash(demoPassword, 10),
      role: "SUPER_ADMIN",
      organizationId: demoFixtureIds.platform,
    },
  });

  const [platform, freshSupplier, beverageSupplier, alNoorStore] =
    await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: demoFixtureIds.platform },
      }),
      prisma.organization.findUniqueOrThrow({
        where: { id: demoFixtureIds.supplier },
      }),
      prisma.organization.findUniqueOrThrow({
        where: { id: demoFixtures.suppliers[1].id },
      }),
      prisma.organization.findUniqueOrThrow({
        where: { id: demoFixtureIds.store },
      }),
    ]);
  const [
    demoAdmin,
    freshAdmin,
    beverageAdmin,
    storeAdmin,
    freshDriver,
    beverageDriver,
  ] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: demoFixtureIds.adminUser } }),
    prisma.user.findUniqueOrThrow({
      where: { id: demoFixtureIds.supplierUser },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: "hosted-demo-user-supplier-nizwa" },
    }),
    prisma.user.findUniqueOrThrow({ where: { id: demoFixtureIds.storeUser } }),
    prisma.user.findUniqueOrThrow({ where: { id: demoFixtureIds.driverUser } }),
    prisma.user.findUniqueOrThrow({
      where: { id: "hosted-demo-user-driver-nizwa-1" },
    }),
  ]);
  const [
    storeShipping,
    storeBilling,
    freshWarehouseAddress,
    beverageWarehouseAddress,
  ] = await Promise.all([
    prisma.address.findUniqueOrThrow({
      where: { id: demoFixtureIds.storeShippingAddress },
    }),
    prisma.address.findUniqueOrThrow({
      where: { id: demoFixtureIds.storeBillingAddress },
    }),
    prisma.address.findUniqueOrThrow({
      where: { id: demoFixtureIds.warehouseAddress },
    }),
    prisma.address.findUniqueOrThrow({
      where: { id: "hosted-demo-address-warehouse-nizwa-main" },
    }),
  ]);
  const [
    freshWarehouse,
    beverageWarehouse,
    freshMilk,
    laban,
    beverageWater,
    plan,
    seededOrder,
  ] = await Promise.all([
    prisma.warehouse.findUniqueOrThrow({
      where: { id: demoFixtureIds.warehouse },
    }),
    prisma.warehouse.findUniqueOrThrow({
      where: { id: "hosted-demo-warehouse-nizwa-main" },
    }),
    prisma.product.findUniqueOrThrow({
      where: { id: demoFixtureIds.milkProduct },
    }),
    prisma.product.findUniqueOrThrow({
      where: { id: demoFixtureIds.labanProduct },
    }),
    prisma.product.findUniqueOrThrow({
      where: { id: demoFixtures.products[10].id },
    }),
    prisma.plan.findUniqueOrThrow({ where: { id: demoFixtureIds.plan } }),
    prisma.order.findUniqueOrThrow({ where: { id: demoFixtureIds.order } }),
  ]);

  return {
    password: demoPassword,
    organizations: { platform, freshSupplier, beverageSupplier, alNoorStore },
    users: {
      superAdmin,
      demoAdmin,
      freshAdmin,
      beverageAdmin,
      storeAdmin,
      freshDriver,
      beverageDriver,
    },
    addresses: {
      storeShipping,
      storeBilling,
      freshWarehouseAddress,
      beverageWarehouseAddress,
    },
    warehouses: { freshWarehouse, beverageWarehouse },
    products: { freshMilk, laban, beverageWater },
    plan,
    seededOrder,
  };
}

async function clearDatabase(prisma: PrismaClient) {
  await prisma.recurringOrderItem.deleteMany();
  await prisma.recurringOrder.deleteMany();
  await prisma.platformSetting.deleteMany();
  await prisma.paymentAttempt.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.deliveryEvent.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.orderEvent.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.checkout.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.inventoryStock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.address.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}
