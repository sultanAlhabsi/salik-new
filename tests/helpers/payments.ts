import type { PaymentStatus } from "@prisma/client";
import { nanoid } from "nanoid";

export type PaymentWebhookEvent = {
  orderId: string;
  provider: string;
  providerReference: string;
  idempotencyKey: string;
  status: PaymentStatus;
};

export const paymentWebhookTestSecrets = {
  valid: "test-payment-webhook-secret",
  invalid: "invalid-test-payment-webhook-secret",
  headers(valid = true) {
    return { "x-salik-webhook-secret": valid ? this.valid : this.invalid };
  },
};

export function createPaymentWebhookFixtures(
  orderId: string,
  options: {
    provider?: string;
    providerReference?: string;
    runId?: string;
  } = {},
) {
  const provider = options.provider ?? "local-pay";
  const runId = options.runId ?? nanoid(8);
  const providerReference = options.providerReference ?? `pay_${runId}`;
  const event = (
    status: PaymentStatus,
    overrides: Partial<PaymentWebhookEvent> = {},
  ): PaymentWebhookEvent => ({
    orderId,
    provider,
    providerReference,
    idempotencyKey: `webhook-${status.toLowerCase()}-${runId}`,
    status,
    ...overrides,
  });
  const processing = event("PROCESSING");
  const paid = event("PAID");
  const failed = event("FAILED");

  return {
    processing,
    paid,
    failed,
    event,
    conflictingRetry(
      original: PaymentWebhookEvent,
      overrides: Partial<PaymentWebhookEvent>,
    ) {
      return {
        ...original,
        ...overrides,
        idempotencyKey: original.idempotencyKey,
      };
    },
  };
}
