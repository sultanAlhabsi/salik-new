import { describe, expect, it } from "vitest";
import {
  createPaymentWebhookFixtures,
  paymentWebhookTestSecrets,
} from "../helpers/payments";
import { useTestApp } from "./helpers";

describe("payment webhook idempotency", () => {
  const ctx = useTestApp();

  it("rejects webhook calls that do not present the configured provider secret", async () => {
    const response = await ctx.agent
      .post("/api/payments/webhook")
      .set(paymentWebhookTestSecrets.headers(false))
      .send({});

    expect(response.status).toBe(401);
  });

  it("updates order and invoice once when a provider retries the same paid event", async () => {
    await ctx.login("store@alnoor.om");
    await ctx.agent
      .post("/api/store/cart/items")
      .send({ productId: ctx.seed.products.freshMilk.id, quantity: 2 });
    const checkout = await ctx.agent.post("/api/store/checkout").send({
      deliveryAddressId: ctx.seed.addresses.storeShipping.id,
      paymentMethod: "CARD",
      idempotencyKey: "checkout-payment-001",
    });
    const orderId = checkout.body.orders[0].id;

    const fixtures = createPaymentWebhookFixtures(orderId, {
      providerReference: "pay_oman_001",
      runId: "retry-001",
    });

    const webhook = () =>
      ctx.agent
        .post("/api/payments/webhook")
        .set(paymentWebhookTestSecrets.headers());
    expect((await webhook().send(fixtures.processing)).status).toBe(200);
    expect((await webhook().send(fixtures.paid)).status).toBe(200);
    expect((await webhook().send(fixtures.paid)).status).toBe(200);

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { invoice: true },
    });
    const paidAttempts = await ctx.prisma.paymentAttempt.count({
      where: { orderId, status: "PAID" },
    });

    expect(order.paymentStatus).toBe("PAID");
    expect(order.invoice?.status).toBe("PAID");
    expect(paidAttempts).toBe(1);
  });

  it("rejects a conflicting provider retry that reuses an idempotency key", async () => {
    await ctx.login("store@alnoor.om");
    await ctx.agent
      .post("/api/store/cart/items")
      .send({ productId: ctx.seed.products.freshMilk.id, quantity: 1 });
    const checkout = await ctx.agent.post("/api/store/checkout").send({
      deliveryAddressId: ctx.seed.addresses.storeShipping.id,
      paymentMethod: "CARD",
      idempotencyKey: "checkout-conflicting-webhook-001",
    });
    const fixtures = createPaymentWebhookFixtures(checkout.body.orders[0].id, {
      runId: "conflict-001",
    });
    const webhook = () =>
      ctx.agent
        .post("/api/payments/webhook")
        .set(paymentWebhookTestSecrets.headers());

    expect((await webhook().send(fixtures.processing)).status).toBe(200);
    expect(
      (
        await webhook().send(
          fixtures.conflictingRetry(fixtures.processing, {
            providerReference: "unexpected-provider-reference",
          }),
        )
      ).status,
    ).toBe(409);

    expect(
      await ctx.prisma.paymentAttempt.count({
        where: { orderId: checkout.body.orders[0].id },
      }),
    ).toBe(1);
  });

  it("initiates a store card payment idempotently before provider confirmation", async () => {
    await ctx.login("store@alnoor.om");
    await ctx.agent
      .post("/api/store/cart/items")
      .send({ productId: ctx.seed.products.freshMilk.id, quantity: 1 });
    const checkout = await ctx.agent.post("/api/store/checkout").send({
      deliveryAddressId: ctx.seed.addresses.storeShipping.id,
      paymentMethod: "CARD",
      idempotencyKey: "checkout-card-init-001",
    });
    const orderId = checkout.body.orders[0].id;
    const payload = {
      provider: "local-pay",
      idempotencyKey: "payment-initiation-001",
    };

    const first = await ctx.agent
      .post(`/api/store/orders/${orderId}/payments`)
      .send(payload);
    const retry = await ctx.agent
      .post(`/api/store/orders/${orderId}/payments`)
      .send(payload);

    expect(first.status).toBe(201);
    expect(first.body.attempt.status).toBe("PROCESSING");
    expect(retry.status).toBe(200);
    expect(retry.body.attempt.id).toBe(first.body.attempt.id);
    expect(
      (await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } }))
        .paymentStatus,
    ).toBe("PROCESSING");
  });
});
