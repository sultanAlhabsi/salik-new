import { describe, expect, it, vi } from "vitest";
import { withTestDatabase } from "../integration/helpers";
import {
  createBarrier,
  createFailureController,
  withFrozenTime,
} from "./async-controls";

describe("deterministic async test controls", () => {
  it("freezes time for the callback and restores real timers afterward", async () => {
    const instant = new Date("2026-07-20T08:00:00.000Z");

    await withFrozenTime(instant, async () => {
      expect(new Date()).toEqual(instant);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(Date.now()).toBe(instant.getTime() + 1_000);
    });

    expect(vi.isFakeTimers()).toBe(false);
  });

  it("releases concurrent work only when every participant reaches the barrier", async () => {
    const barrier = createBarrier(2);
    const events: string[] = [];

    const first = (async () => {
      events.push("first-ready");
      await barrier.wait();
      events.push("first-released");
    })();
    const second = (async () => {
      events.push("second-ready");
      await barrier.wait();
      events.push("second-released");
    })();

    await Promise.all([first, second]);
    expect(events.slice(0, 2)).toEqual(["first-ready", "second-ready"]);
    expect(barrier.arrivals).toBe(2);
  });

  it("injects a named failure once and then permits retry", async () => {
    const failures = createFailureController<"payment.capture">();
    failures.failNext("payment.capture", new Error("provider unavailable"));

    await expect(
      failures.run("payment.capture", async () => "captured"),
    ).rejects.toThrow("provider unavailable");
    await expect(
      failures.run("payment.capture", async () => "captured"),
    ).resolves.toBe("captured");
  });

  it("makes a compare-and-swap inventory race repeatable without sleeps", async () => {
    await withTestDatabase(async ({ prisma, factories }) => {
      const scenario = await factories.commerceScenario();
      await prisma.inventoryStock.update({
        where: { id: scenario.stock.id },
        data: { onHand: 1 },
      });
      const barrier = createBarrier(2);
      const reserve = async () => {
        await barrier.wait();
        return prisma.inventoryStock.updateMany({
          where: { id: scenario.stock.id, onHand: { gte: 1 } },
          data: { onHand: { decrement: 1 } },
        });
      };

      const results = await Promise.all([reserve(), reserve()]);
      const stock = await prisma.inventoryStock.findUniqueOrThrow({
        where: { id: scenario.stock.id },
      });

      expect(results.reduce((sum, result) => sum + result.count, 0)).toBe(1);
      expect(stock.onHand).toBe(0);
    }, { seed: false });
  });

  it("demonstrates rollback when failure is injected mid-transaction", async () => {
    await withTestDatabase(async ({ prisma }) => {
      const failures = createFailureController<"supabase.provision">();
      failures.failNext(
        "supabase.provision",
        new Error("Supabase unavailable"),
      );

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.organization.create({
            data: { name: "Rollback supplier", type: "SUPPLIER" },
          });
          await failures.run("supabase.provision", async () => undefined);
        }),
      ).rejects.toThrow("Supabase unavailable");

      expect(await prisma.organization.count()).toBe(0);
    }, { seed: false });
  });
});
