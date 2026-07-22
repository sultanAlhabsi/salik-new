import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import {
  demoFixtures,
  demoPassword,
  preparedDemoAccounts,
  validateDemoFixtures,
} from "./demo-fixtures.js";

export type DemoDatasetOptions = {
  authUserIds?: ReadonlyMap<string, string>;
};

export async function persistDemoDataset(
  prisma: PrismaClient,
  options: DemoDatasetOptions = {},
) {
  validateDemoFixtures(demoFixtures);
  const passwordHash = await bcrypt.hash(demoPassword, 10);

  await prisma.$transaction(
    async (transaction) => {
      for (const organization of demoFixtures.organizations) {
        await transaction.organization.upsert({
          where: { id: organization.id },
          create: { ...organization, status: "ACTIVE" },
          update: { ...organization, status: "ACTIVE", archivedAt: null },
        });
      }

      for (const address of demoFixtures.addresses) {
        await transaction.address.upsert({
          where: { id: address.id },
          create: address,
          update: address,
        });
      }

      for (const warehouse of demoFixtures.warehouses) {
        await transaction.warehouse.upsert({
          where: { id: warehouse.id },
          create: warehouse,
          update: warehouse,
        });
      }

      await transaction.plan.upsert({
        where: { id: demoFixtures.plan.id },
        create: demoFixtures.plan,
        update: demoFixtures.plan,
      });

      for (const subscription of demoFixtures.subscriptions) {
        await transaction.subscription.upsert({
          where: { id: subscription.id },
          create: subscription,
          update: subscription,
        });
      }

      const preparedEmails = new Set<string>(
        preparedDemoAccounts.map(({ email }) => email),
      );
      for (const user of demoFixtures.users) {
        const authUserId = options.authUserIds?.get(user.email);
        const data = {
          email: user.email,
          name: user.name,
          passwordHash,
          role: user.role,
          status: "ACTIVE" as const,
          organizationId: user.organizationId,
          ...(preparedEmails.has(user.email) && authUserId
            ? { authUserId }
            : {}),
        };
        await transaction.user.upsert({
          where: { id: user.id },
          create: { id: user.id, ...data },
          update: data,
        });
      }

      for (const category of demoFixtures.categories) {
        await transaction.productCategory.upsert({
          where: { id: category.id },
          create: category,
          update: category,
        });
      }

      for (const product of demoFixtures.products) {
        await transaction.product.upsert({
          where: { id: product.id },
          create: product,
          update: product,
        });
      }

      for (const stock of demoFixtures.stocks) {
        await transaction.inventoryStock.upsert({
          where: { id: stock.id },
          create: stock,
          update: stock,
        });
      }
    },
    { maxWait: 10_000, timeout: 60_000 },
  );

  await prisma.$transaction(
    async (transaction) => {
      for (const cart of demoFixtures.carts) {
        await transaction.cart.upsert({
          where: { id: cart.id },
          create: cart,
          update: cart,
        });
      }
      for (const cartItem of demoFixtures.cartItems) {
        await transaction.cartItem.upsert({
          where: { id: cartItem.id },
          create: cartItem,
          update: cartItem,
        });
      }

      for (const recurringOrder of demoFixtures.recurringOrders) {
        const { items, ...orderData } = recurringOrder;
        await transaction.recurringOrder.upsert({
          where: { id: orderData.id },
          create: orderData,
          update: orderData,
        });
        for (const item of items) {
          const data = { ...item, recurringOrderId: orderData.id };
          await transaction.recurringOrderItem.upsert({
            where: { id: item.id },
            create: data,
            update: data,
          });
        }
      }

      for (const order of demoFixtures.orders) {
        const { items, ...orderData } = order;
        await transaction.order.upsert({
          where: { id: orderData.id },
          create: orderData,
          update: orderData,
        });
        for (const item of items) {
          const data = {
            id: item.id,
            orderId: orderData.id,
            productId: item.productId,
            skuSnapshot: item.skuSnapshot,
            nameSnapshot: item.nameSnapshot,
            unit: item.unit,
            quantity: item.quantity,
            unitPriceBaisa: item.unitPriceBaisa,
            taxRateBps: item.taxRateBps,
            lineTotalBaisa: item.lineTotalBaisa,
          };
          await transaction.orderItem.upsert({
            where: { id: item.id },
            create: data,
            update: data,
          });
        }
      }

      for (const event of demoFixtures.orderEvents) {
        await transaction.orderEvent.upsert({
          where: { id: event.id },
          create: event,
          update: event,
        });
      }
      for (const movement of demoFixtures.movements) {
        await transaction.inventoryMovement.upsert({
          where: { id: movement.id },
          create: movement,
          update: movement,
        });
      }
      for (const invoice of demoFixtures.invoices) {
        await transaction.invoice.upsert({
          where: { id: invoice.id },
          create: invoice,
          update: invoice,
        });
      }
      for (const payment of demoFixtures.paymentAttempts) {
        await transaction.paymentAttempt.upsert({
          where: { id: payment.id },
          create: payment,
          update: payment,
        });
      }
      for (const delivery of demoFixtures.deliveries) {
        await transaction.delivery.upsert({
          where: { id: delivery.id },
          create: delivery,
          update: delivery,
        });
      }
      for (const event of demoFixtures.deliveryEvents) {
        await transaction.deliveryEvent.upsert({
          where: { id: event.id },
          create: event,
          update: event,
        });
      }
      for (const notification of demoFixtures.notifications) {
        await transaction.notification.upsert({
          where: { id: notification.id },
          create: notification,
          update: notification,
        });
      }
      for (const ticket of demoFixtures.supportTickets) {
        await transaction.supportTicket.upsert({
          where: { id: ticket.id },
          create: ticket,
          update: ticket,
        });
      }
      for (const audit of demoFixtures.auditLogs) {
        await transaction.auditLog.upsert({
          where: { id: audit.id },
          create: audit,
          update: audit,
        });
      }
      for (const setting of demoFixtures.platformSettings) {
        await transaction.platformSetting.upsert({
          where: { id: setting.id },
          create: setting,
          update: setting,
        });
      }
    },
    { maxWait: 10_000, timeout: 60_000 },
  );

  const [
    organizations,
    users,
    addresses,
    warehouses,
    products,
    plan,
    seededOrder,
  ] = await Promise.all([
    prisma.organization.findMany({
      where: { id: { startsWith: "hosted-demo-" } },
    }),
    prisma.user.findMany({ where: { id: { startsWith: "hosted-demo-" } } }),
    prisma.address.findMany({ where: { id: { startsWith: "hosted-demo-" } } }),
    prisma.warehouse.findMany({
      where: { id: { startsWith: "hosted-demo-" } },
    }),
    prisma.product.findMany({ where: { id: { startsWith: "hosted-demo-" } } }),
    prisma.plan.findUniqueOrThrow({ where: { id: demoFixtures.plan.id } }),
    prisma.order.findUniqueOrThrow({
      where: { id: demoFixtures.orders[0].id },
    }),
  ]);

  return {
    password: demoPassword,
    organizations,
    users,
    addresses,
    warehouses,
    products,
    plan,
    seededOrder,
  };
}
