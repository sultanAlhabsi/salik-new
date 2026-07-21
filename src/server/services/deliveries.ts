import type { DeliveryStatus, PrismaClient } from '@prisma/client';
import type { AuthUser } from '../domain/access.js';
import { badRequest, conflict, forbidden, notFound } from '../domain/errors.js';
import { assertDeliveryTransition, assertOrderTransition } from '../domain/stateMachines.js';
import { deductReservedInventory } from './inventory.js';
import { notifyOrganization } from './notifications.js';
import { writeAudit } from './audit.js';

export async function assignDriverToOrder(
  db: PrismaClient,
  input: {
    supplierUser: AuthUser;
    orderId: string;
    driverId: string;
  }
) {
  const supplierId = input.supplierUser.organizationId;
  if (!supplierId) throw forbidden();

  const order = await db.order.findFirst({ where: { id: input.orderId, supplierId }, include: { items: true } });
  if (!order) throw notFound('Order');
  const existingDelivery = await db.delivery.findUnique({ where: { orderId: order.id } });
  if (order.status !== 'READY_FOR_DELIVERY' && existingDelivery?.status !== 'RESCHEDULED') {
    throw badRequest('ORDER_NOT_READY', 'Only ready or rescheduled orders can be assigned to a driver');
  }

  const driver = await db.user.findFirst({
    where: { id: input.driverId, organizationId: supplierId, role: 'DRIVER', status: 'ACTIVE' }
  });
  if (!driver) {
    throw badRequest('INVALID_DRIVER', 'Driver must be active and belong to this supplier');
  }

  return db.$transaction(async (tx) => {
    const delivery = await tx.delivery.upsert({
      where: { orderId: order.id },
      update: { driverId: driver.id, status: 'ASSIGNED', failureReason: null },
      create: {
        supplierId,
        storeId: order.storeId,
        orderId: order.id,
        driverId: driver.id,
        status: 'ASSIGNED'
      }
    });
    await tx.deliveryEvent.create({
      data: {
        deliveryId: delivery.id,
        actorId: input.supplierUser.id,
        newStatus: 'ASSIGNED',
        message: `Delivery assigned to ${driver.name}`
      }
    });
    await notifyOrganization(tx, {
      organizationId: order.storeId,
      entityType: 'delivery',
      entityId: delivery.id,
      title: 'Delivery assigned',
      body: `A driver has been assigned to order ${order.id.slice(-6).toUpperCase()}`
    });
    await writeAudit(tx, {
      actorId: input.supplierUser.id,
      organizationId: supplierId,
      supplierId,
      action: 'DELIVERY_ASSIGNED',
      entityType: 'delivery',
      entityId: delivery.id,
      newValue: { driverId: driver.id, status: 'ASSIGNED' }
    });
    return delivery;
  });
}

export async function updateDriverDeliveryStatus(
  db: PrismaClient,
  input: {
    driverUser: AuthUser;
    deliveryId: string;
    status: DeliveryStatus;
    recipientName?: string;
    proofNote?: string;
    failureReason?: string;
  }
) {
  const delivery = await db.delivery.findFirst({
    where: { id: input.deliveryId, driverId: input.driverUser.id },
    include: { order: { include: { items: true } } }
  });
  if (!delivery) throw notFound('Delivery');
  if (!assertDeliveryTransition(delivery.status, input.status)) {
    throw badRequest('INVALID_DELIVERY_TRANSITION', `Cannot move delivery from ${delivery.status} to ${input.status}`);
  }
  if (input.status === 'FAILED' && !input.failureReason) {
    throw badRequest('FAILURE_REASON_REQUIRED', 'A failed delivery requires a reason');
  }
  if (input.status === 'DELIVERED' && !input.recipientName && !input.proofNote) {
    throw badRequest('PROOF_REQUIRED', 'Delivered status requires recipient name or proof note');
  }

  return db.$transaction(async (tx) => {
    const changed = await tx.delivery.updateMany({
      where: { id: delivery.id, driverId: input.driverUser.id, status: delivery.status },
      data: {
        status: input.status,
        recipientName: input.recipientName,
        proofNote: input.proofNote,
        failureReason: input.failureReason,
        deliveredAt: input.status === 'DELIVERED' ? new Date() : delivery.deliveredAt
      }
    });
    if (changed.count !== 1) throw conflict('DELIVERY_STATE_CONFLICT', 'The delivery changed while this update was being applied');
    await tx.deliveryEvent.create({
      data: {
        deliveryId: delivery.id,
        actorId: input.driverUser.id,
        previousStatus: delivery.status,
        newStatus: input.status,
        message: `Delivery moved from ${delivery.status} to ${input.status}`
      }
    });

    if (input.status === 'OUT_FOR_DELIVERY' && assertOrderTransition(delivery.order.status, 'OUT_FOR_DELIVERY')) {
      const orderChanged = await tx.order.updateMany({
        where: { id: delivery.orderId, status: delivery.order.status },
        data: { status: 'OUT_FOR_DELIVERY' }
      });
      if (orderChanged.count !== 1) throw conflict('ORDER_STATE_CONFLICT', 'The order changed while dispatch was being recorded');
    }

    if (input.status === 'DELIVERED') {
      for (const item of delivery.order.items) {
        await deductReservedInventory(tx, {
          supplierId: delivery.supplierId,
          productId: item.productId,
          quantity: item.quantity,
          orderId: delivery.orderId,
          actorId: input.driverUser.id,
          idempotencyKey: `deduct:${delivery.orderId}:${item.productId}`
        });
      }
      const orderChanged = await tx.order.updateMany({
        where: { id: delivery.orderId, status: 'OUT_FOR_DELIVERY' },
        data: { status: 'DELIVERED' }
      });
      if (orderChanged.count !== 1) throw conflict('ORDER_STATE_CONFLICT', 'The order changed while delivery was being recorded');
    }

    await notifyOrganization(tx, {
      organizationId: delivery.storeId,
      entityType: 'delivery',
      entityId: delivery.id,
      title: 'Delivery updated',
      body: `Delivery status changed to ${input.status.replaceAll('_', ' ').toLowerCase()}`
    });
    await writeAudit(tx, {
      actorId: input.driverUser.id,
      organizationId: delivery.supplierId,
      supplierId: delivery.supplierId,
      action: 'DELIVERY_STATUS_CHANGED',
      entityType: 'delivery',
      entityId: delivery.id,
      previousValue: { status: delivery.status },
      newValue: { status: input.status }
    });

    return tx.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
  });
}
