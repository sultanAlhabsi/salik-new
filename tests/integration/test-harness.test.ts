import { describe, expect, it } from "vitest";
import { postgresSchemaExists } from "../helpers/postgres";
import { createTestDatabase, withTestDatabase } from "./helpers";

describe("integration test database harness", () => {
  it("builds a typed minimal commerce scenario without the demo seed", async () => {
    const testDatabase = await createTestDatabase({ seed: false });

    try {
      const scenario = await testDatabase.factories.commerceScenario();
      const order = await testDatabase.factories.order({
        supplierId: scenario.supplier.id,
        storeId: scenario.store.id,
        createdById: scenario.storeUser.id,
        deliveryAddressId: scenario.deliveryAddress.id,
        productId: scenario.product.id,
      });

      expect(scenario.supplier.type).toBe("SUPPLIER");
      expect(scenario.store.type).toBe("STORE");
      expect(scenario.stock.productId).toBe(scenario.product.id);
      expect(order.items).toHaveLength(1);
      expect(await testDatabase.prisma.organization.count()).toBe(2);
    } finally {
      await testDatabase.dispose();
    }
  });

  it("uses a fresh database for every lifecycle", async () => {
    const first = await createTestDatabase({ seed: false });
    await first.factories.organization({ name: "Only in the first database" });
    const firstScope = first.databaseScope;
    await first.dispose();

    const second = await createTestDatabase({ seed: false });
    try {
      expect(second.databaseScope).not.toBe(firstScope);
      expect(await second.prisma.organization.count()).toBe(0);
    } finally {
      await second.dispose();
    }
  });

  it("removes the temporary database even when a scenario fails", async () => {
    let temporarySchema = "";

    await expect(
      withTestDatabase(
        async (testDatabase) => {
          temporarySchema = testDatabase.databaseScope;
          expect(await postgresSchemaExists(temporarySchema)).toBe(true);
          await testDatabase.factories.organization();
          throw new Error("intentional scenario failure");
        },
        { seed: false },
      ),
    ).rejects.toThrow("intentional scenario failure");

    expect(await postgresSchemaExists(temporarySchema)).toBe(false);
  });
});
