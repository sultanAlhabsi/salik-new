import { describe, expect, it } from "vitest";
import {
  createPaymentWebhookFixtures,
  paymentWebhookTestSecrets,
} from "./payments";

describe("payment webhook fixtures", () => {
  it("creates typed processing, paid and failed provider events", () => {
    const fixtures = createPaymentWebhookFixtures("order-123", {
      providerReference: "provider-456",
    });

    expect(fixtures.processing).toMatchObject({
      orderId: "order-123",
      status: "PROCESSING",
    });
    expect(fixtures.paid).toMatchObject({
      orderId: "order-123",
      status: "PAID",
    });
    expect(fixtures.failed).toMatchObject({
      orderId: "order-123",
      status: "FAILED",
    });
    expect(
      new Set([
        fixtures.processing.idempotencyKey,
        fixtures.paid.idempotencyKey,
        fixtures.failed.idempotencyKey,
      ]).size,
    ).toBe(3);
  });

  it("builds a conflicting retry by preserving the idempotency key", () => {
    const fixtures = createPaymentWebhookFixtures("order-123");
    const conflicting = fixtures.conflictingRetry(fixtures.paid, {
      providerReference: "different-reference",
    });

    expect(conflicting.idempotencyKey).toBe(fixtures.paid.idempotencyKey);
    expect(conflicting.providerReference).not.toBe(
      fixtures.paid.providerReference,
    );
  });

  it("uses explicit test-only valid and invalid secrets", () => {
    expect(paymentWebhookTestSecrets.valid).toBe("test-payment-webhook-secret");
    expect(paymentWebhookTestSecrets.invalid).not.toBe(
      paymentWebhookTestSecrets.valid,
    );
    expect(paymentWebhookTestSecrets.headers()).toEqual({
      "x-salik-webhook-secret": paymentWebhookTestSecrets.valid,
    });
  });
});
