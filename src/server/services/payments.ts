import type { PaymentStatus, PrismaClient } from '@prisma/client';
import { assertPaymentTransition } from '../domain/stateMachines.js';
import { badRequest, conflict, notFound } from '../domain/errors.js';
import { writeAudit } from './audit.js';
import { notifyOrganization } from './notifications.js';

export async function processPaymentWebhook(
  db: PrismaClient,
  input: {
    orderId: string;
    provider: string;
    providerReference: string;
    idempotencyKey: string;
    status: PaymentStatus;
  }
) {
  const existing = await db.paymentAttempt.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (
      existing.orderId !== input.orderId ||
      existing.provider !== input.provider ||
      existing.providerReference !== input.providerReference ||
      existing.status !== input.status
    ) {
      throw conflict('PAYMENT_IDEMPOTENCY_CONFLICT', 'This payment idempotency key belongs to a different event');
    }
    const order = await db.order.findUniqueOrThrow({ where: { id: existing.orderId ?? input.orderId }, include: { invoice: true } });
    return { attempt: existing, order, reused: true };
  }

  const order = await db.order.findUnique({ where: { id: input.orderId }, include: { invoice: true } });
  if (!order || !order.invoice) {
    throw notFound('Order invoice');
  }
  if (!assertPaymentTransition(order.paymentStatus, input.status)) {
    throw badRequest('INVALID_PAYMENT_TRANSITION', `Cannot move payment from ${order.paymentStatus} to ${input.status}`);
  }

  return db.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.create({
      data: {
        orderId: order.id,
        invoiceId: order.invoice?.id,
        provider: input.provider,
        providerReference: input.providerReference,
        idempotencyKey: input.idempotencyKey,
        status: input.status,
        amountBaisa: order.totalBaisa,
        rawEventJson: JSON.stringify(input)
      }
    });

    const changed = await tx.order.updateMany({
      where: { id: order.id, paymentStatus: order.paymentStatus },
      data: { paymentStatus: input.status }
    });
    if (changed.count !== 1) throw conflict('PAYMENT_STATE_CONFLICT', 'Payment state changed while this event was being processed');

    if (input.status === 'PAID') {
      await tx.invoice.update({ where: { id: order.invoice!.id }, data: { status: 'PAID' } });
    }

    await notifyOrganization(tx, {
      organizationId: order.storeId,
      entityType: 'order',
      entityId: order.id,
      title: `Payment ${input.status.toLowerCase()}`,
      body: `Payment provider ${input.provider} reported ${input.status.toLowerCase()} for invoice ${order.invoice!.invoiceNumber}`
    });
    await writeAudit(tx, {
      organizationId: order.storeId,
      supplierId: order.supplierId,
      action: 'PAYMENT_WEBHOOK_PROCESSED',
      entityType: 'order',
      entityId: order.id,
      previousValue: { paymentStatus: order.paymentStatus },
      newValue: { paymentStatus: input.status, providerReference: input.providerReference }
    });

    const updatedOrder = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { invoice: true } });
    return { attempt, order: updatedOrder, reused: false };
  });
}
