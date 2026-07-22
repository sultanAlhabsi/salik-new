import { describe, expect, it } from "vitest";
import {
  demoFixtureCounts,
  demoFixtureIds,
  demoFixtures,
  preparedDemoAccounts,
  validateDemoFixtures,
} from "../../src/server/services/demo-fixtures";

function countBy<T extends Record<string, unknown>, K extends keyof T>(
  records: readonly T[],
  key: K,
) {
  return Object.fromEntries(
    records.reduce((counts, record) => {
      const value = String(record[key]);
      counts.set(value, (counts.get(value) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  );
}

describe("demo fixture catalog", () => {
  it("contains the approved medium demo network", () => {
    expect(demoFixtureCounts).toEqual({
      suppliers: 4,
      stores: 6,
      products: 40,
      drivers: 6,
      orders: 20,
      warehouses: 5,
      subscriptions: 4,
    });
    expect(countBy(demoFixtures.products, "status")).toEqual({
      PUBLISHED: 32,
      DRAFT: 4,
      HIDDEN: 2,
      ARCHIVED: 2,
    });
    expect(new Set(demoFixtures.orders.map(({ status }) => status))).toEqual(
      new Set([
        "SUBMITTED",
        "ACCEPTED",
        "PREPARING",
        "READY_FOR_DELIVERY",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "REJECTED",
        "CANCELLED",
      ]),
    );
  });

  it("keeps exactly the four prepared portal accounts", () => {
    expect(preparedDemoAccounts.map(({ email }) => email)).toEqual([
      "supplier@fresh.om",
      "store@alnoor.om",
      "driver@fresh.om",
      "demo-admin@salik.om",
    ]);
    expect(
      demoFixtures.users.filter(({ role }) => role === "DRIVER"),
    ).toHaveLength(6);
  });

  it("passes all relationship and financial invariants", () => {
    expect(() => validateDemoFixtures(demoFixtures)).not.toThrow();

    const primaryStoreId = demoFixtureIds.store;
    const primarySupplierId = demoFixtureIds.supplier;
    expect(
      new Set(
        demoFixtures.orders
          .filter(({ storeId }) => storeId === primaryStoreId)
          .map(({ supplierId }) => supplierId),
      ).size,
    ).toBe(4);
    expect(
      new Set(
        demoFixtures.orders
          .filter(({ supplierId }) => supplierId === primarySupplierId)
          .map(({ storeId }) => storeId),
      ).size,
    ).toBeGreaterThan(1);
  });

  it("rejects duplicate reserved identifiers", () => {
    expect(() =>
      validateDemoFixtures({
        ...demoFixtures,
        stores: [...demoFixtures.stores, demoFixtures.stores[0]],
      }),
    ).toThrow(`Duplicate demo fixture id: ${demoFixtures.stores[0].id}`);
  });
});
