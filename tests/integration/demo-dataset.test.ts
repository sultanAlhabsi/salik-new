import { describe, expect, it } from "vitest";
import { createTestDatabase } from "./helpers";

describe("shared demo dataset persistence", () => {
  it("seeds the complete network and keeps prepared aliases", async () => {
    const database = await createTestDatabase();
    try {
      const reserved = { id: { startsWith: "hosted-demo-" } };
      const [
        suppliers,
        stores,
        products,
        drivers,
        orders,
        warehouses,
        subscriptions,
      ] = await Promise.all([
        database.prisma.organization.count({
          where: { ...reserved, type: "SUPPLIER" },
        }),
        database.prisma.organization.count({
          where: { ...reserved, type: "STORE" },
        }),
        database.prisma.product.count({ where: reserved }),
        database.prisma.user.count({ where: { ...reserved, role: "DRIVER" } }),
        database.prisma.order.count({ where: reserved }),
        database.prisma.warehouse.count({ where: reserved }),
        database.prisma.subscription.count({ where: reserved }),
      ]);
      expect({
        suppliers,
        stores,
        products,
        drivers,
        orders,
        warehouses,
        subscriptions,
      }).toEqual({
        suppliers: 4,
        stores: 6,
        products: 40,
        drivers: 6,
        orders: 20,
        warehouses: 5,
        subscriptions: 4,
      });
      expect(database.seed?.users.storeAdmin.email).toBe("store@alnoor.om");
      expect(database.seed?.users.freshAdmin.email).toBe("supplier@fresh.om");
      expect(database.seed?.organizations.freshSupplier.id).toBe(
        "hosted-demo-supplier",
      );
    } finally {
      await database.dispose();
    }
  });

  it("populates every prepared tenant portal with connected activity", async () => {
    const database = await createTestDatabase();
    try {
      const storeId = database.seed!.organizations.alNoorStore.id;
      const supplierId = database.seed!.organizations.freshSupplier.id;
      const driverId = database.seed!.users.freshDriver.id;
      const [storeSuppliers, supplierStores, driverStates] = await Promise.all([
        database.prisma.order.findMany({
          where: { storeId },
          distinct: ["supplierId"],
          select: { supplierId: true },
        }),
        database.prisma.order.findMany({
          where: { supplierId },
          distinct: ["storeId"],
          select: { storeId: true },
        }),
        database.prisma.delivery.findMany({
          where: { driverId },
          distinct: ["status"],
          select: { status: true },
        }),
      ]);
      expect(storeSuppliers).toHaveLength(4);
      expect(supplierStores.length).toBeGreaterThan(1);
      expect(driverStates.length).toBeGreaterThan(1);
    } finally {
      await database.dispose();
    }
  });

  it("persists internally consistent order and invoice totals", async () => {
    const database = await createTestDatabase();
    try {
      const orders = await database.prisma.order.findMany({
        where: { id: { startsWith: "hosted-demo-" } },
        include: { items: true, invoice: true },
      });
      for (const order of orders) {
        expect(
          order.items.reduce((sum, item) => sum + item.lineTotalBaisa, 0),
        ).toBe(order.subtotalBaisa + order.taxBaisa);
        expect(order.totalBaisa).toBe(
          order.subtotalBaisa +
            order.taxBaisa +
            order.shippingBaisa -
            order.discountBaisa,
        );
        if (order.invoice) {
          expect(order.invoice.totalBaisa).toBe(order.totalBaisa);
        }
      }
    } finally {
      await database.dispose();
    }
  });
});
