import type { InventoryMovementType, Prisma, PrismaClient } from '@prisma/client';
import { badRequest, conflict, notFound } from '../domain/errors.js';

type Db = PrismaClient | Prisma.TransactionClient;

export async function reserveInventory(
  db: Db,
  input: {
    supplierId: string;
    productId: string;
    quantity: number;
    orderId: string;
    actorId: string;
    idempotencyKey: string;
  }
) {
  return changeInventory(db, {
    supplierId: input.supplierId,
    productId: input.productId,
    quantity: input.quantity,
    orderId: input.orderId,
    actorId: input.actorId,
    idempotencyKey: input.idempotencyKey,
    type: 'RESERVATION'
  });
}

export async function releaseInventory(
  db: Db,
  input: {
    supplierId: string;
    productId: string;
    quantity: number;
    orderId: string;
    actorId: string;
    idempotencyKey: string;
  }
) {
  return changeInventory(db, { ...input, type: 'RELEASE' });
}

export async function deductReservedInventory(
  db: Db,
  input: {
    supplierId: string;
    productId: string;
    quantity: number;
    orderId: string;
    actorId: string;
    idempotencyKey: string;
  }
) {
  return changeInventory(db, { ...input, type: 'DEDUCTION' });
}

export async function adjustInventory(
  db: PrismaClient,
  input: {
    supplierId: string;
    productId: string;
    warehouseId: string;
    quantity: number;
    actorId: string;
    type: Extract<InventoryMovementType, 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'>;
    idempotencyKey: string;
  }
) {
  if (input.quantity <= 0) {
    throw badRequest('INVALID_QUANTITY', 'Quantity must be greater than zero');
  }
  const existing = await db.inventoryMovement.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    assertMatchingAdjustment(existing, input);
    return existing;
  }

  return db.$transaction(async (tx) => {
    const repeated = await tx.inventoryMovement.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (repeated) {
      assertMatchingAdjustment(repeated, input);
      return repeated;
    }
    const stock = await tx.inventoryStock.findUnique({
      where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } }
    });
    if (!stock || stock.supplierId !== input.supplierId) {
      throw notFound('Inventory stock');
    }
    const afterOnHand = input.type === 'ADJUSTMENT_IN' ? stock.onHand + input.quantity : stock.onHand - input.quantity;
    if (afterOnHand < stock.reserved) {
      throw conflict('NEGATIVE_STOCK', 'Adjustment would make available stock negative');
    }
    const changed = await tx.inventoryStock.updateMany({
      where: { id: stock.id, onHand: stock.onHand, reserved: stock.reserved },
      data: { onHand: afterOnHand }
    });
    if (changed.count !== 1) throw conflict('INVENTORY_CONFLICT', 'Inventory changed while the adjustment was being applied');
    const movement = await tx.inventoryMovement.create({
      data: {
        supplierId: input.supplierId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        actorId: input.actorId,
        type: input.type,
        quantity: input.quantity,
        beforeOnHand: stock.onHand,
        afterOnHand,
        beforeReserved: stock.reserved,
        afterReserved: stock.reserved,
        idempotencyKey: input.idempotencyKey
      }
    });
    if (afterOnHand - stock.reserved <= stock.lowStockThreshold && stock.onHand - stock.reserved > stock.lowStockThreshold) {
      await tx.notification.create({ data: { organizationId: input.supplierId, entityType: 'product', entityId: input.productId, title: 'Low stock alert', body: `Available stock has reached ${afterOnHand - stock.reserved} units` } });
    }
    return movement;
  });
}

function assertMatchingAdjustment(
  existing: {
    supplierId: string;
    productId: string;
    warehouseId: string;
    type: InventoryMovementType;
    quantity: number;
  },
  input: {
    supplierId: string;
    productId: string;
    warehouseId: string;
    type: Extract<InventoryMovementType, 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'>;
    quantity: number;
  }
) {
  if (
    existing.supplierId !== input.supplierId ||
    existing.productId !== input.productId ||
    existing.warehouseId !== input.warehouseId ||
    existing.type !== input.type ||
    existing.quantity !== input.quantity
  ) {
    throw conflict(
      'INVENTORY_IDEMPOTENCY_CONFLICT',
      'This inventory idempotency key cannot be reused for this adjustment'
    );
  }
}

async function changeInventory(
  db: Db,
  input: {
    supplierId: string;
    productId: string;
    quantity: number;
    orderId: string;
    actorId: string;
    idempotencyKey: string;
    type: Extract<InventoryMovementType, 'RESERVATION' | 'RELEASE' | 'DEDUCTION'>;
  }
) {
  if (input.quantity <= 0) {
    throw badRequest('INVALID_QUANTITY', 'Quantity must be greater than zero');
  }

  const existing = await db.inventoryMovement.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    return existing;
  }

  const stock = await db.inventoryStock.findFirst({
    where: { supplierId: input.supplierId, productId: input.productId },
    orderBy: { updatedAt: 'asc' }
  });

  if (!stock) {
    throw notFound('Inventory stock');
  }

  let afterOnHand = stock.onHand;
  let afterReserved = stock.reserved;
  const available = stock.onHand - stock.reserved;

  if (input.type === 'RESERVATION') {
    if (available < input.quantity) {
      throw conflict('INSUFFICIENT_STOCK', 'There is not enough stock available for this product');
    }
    afterReserved += input.quantity;
  }

  if (input.type === 'RELEASE') {
    if (stock.reserved < input.quantity) {
      throw conflict('INSUFFICIENT_RESERVED_STOCK', 'Reserved stock is not available for release');
    }
    afterReserved -= input.quantity;
  }

  if (input.type === 'DEDUCTION') {
    if (stock.reserved < input.quantity || stock.onHand < input.quantity) {
      throw conflict('INSUFFICIENT_RESERVED_STOCK', 'Reserved stock is not available for deduction');
    }
    afterReserved -= input.quantity;
    afterOnHand -= input.quantity;
  }

  const changed = await db.inventoryStock.updateMany({
    where: { id: stock.id, onHand: stock.onHand, reserved: stock.reserved },
    data: { onHand: afterOnHand, reserved: afterReserved }
  });
  if (changed.count !== 1) throw conflict('INVENTORY_CONFLICT', 'Inventory changed while this operation was being applied');

  const movement = await db.inventoryMovement.create({
    data: {
      supplierId: input.supplierId,
      productId: input.productId,
      warehouseId: stock.warehouseId,
      orderId: input.orderId,
      actorId: input.actorId,
      type: input.type,
      quantity: input.quantity,
      beforeOnHand: stock.onHand,
      afterOnHand,
      beforeReserved: stock.reserved,
      afterReserved,
      idempotencyKey: input.idempotencyKey
    }
  });
  if (afterOnHand - afterReserved <= stock.lowStockThreshold && stock.onHand - stock.reserved > stock.lowStockThreshold) {
    await db.notification.create({ data: { organizationId: input.supplierId, entityType: 'product', entityId: input.productId, title: 'Low stock alert', body: `Available stock has reached ${afterOnHand - afterReserved} units` } });
  }
  return movement;
}
